/**
 * Association membership verification ("Connect to PASA").
 *
 * Flow: the jumper enters their PASA number → `lookupMembership` (one cached, throttled request)
 * shows what PASA publishes → `connectMembership` applies it: verified flag + expiry + licence +
 * PASA ratings (marked verified). If the PASA name doesn't match the profile name the link waits
 * for a staff member (`reviewMembership`). `recheckMemberships` (hourly cron, each user at most
 * once a day) keeps expiry current and notifies jumpers whose membership lapsed.
 *
 * Respectful use of PASA's public directory:
 *  - member pages cached 24 h (misses 6 h), the members list fetched at most once a day;
 *  - ≥1 s between requests per process, a global hourly budget, and a per-user cooldown;
 *  - identifying User-Agent; failures never block manual entry or staff verification.
 */
import { and, eq, inArray, lt, ne } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { membershipChecks, userRatings, users, type MembershipCheck } from '../db/schema.ts';
import { DomainError } from '../domain/errors.ts';
import { setRatings } from '../domain/profile.ts';
import { notify } from '../domain/notifications.ts';
import { ASSOCIATION_LABELS, type Association } from '../../domain/constants.ts';
import { cacheGet, cacheIncrement, cachePut } from './cache.ts';
import { createHttp } from './http.ts';
import { compareNames, type NameMatch } from './names.ts';
import { pasaProvider } from './pasa/provider.ts';
import { ProviderUnavailableError, type HttpGet, type MembershipProvider, type ProviderId, type ProviderMember } from './types.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const MEMBER_TTL = DAY;
export const MISS_TTL = 6 * HOUR;
/** The current-members list is refreshed at most daily; a stale copy (≤7 days) is used if PASA is down. */
export const LIST_FRESH = DAY;
const LIST_KEEP = 7 * DAY;
export const USER_COOLDOWN = 20_000;
export const HOURLY_BUDGET = 120;
/** Re-verify (details + list) when the last check is older than this. */
export const REVERIFY_AFTER = 30 * DAY;
/** Re-check against the list daily once the expiry is this close (or past). */
export const EXPIRY_WINDOW_DAYS = 14;

/** Registered providers. USPA needs a partner API (the original app had one), so it isn't implemented yet. */
const PROVIDERS: Partial<Record<ProviderId, MembershipProvider>> = { pasa: pasaProvider };

export function getProvider(id: ProviderId): MembershipProvider {
	const p = PROVIDERS[id];
	if (!p) throw new DomainError('invalid', `${id.toUpperCase()} verification isn’t available yet. Enter your membership manually; staff can verify it.`);
	return p;
}

export type MembershipDeps = {
	/** Injected HTTP (tests/fixtures). Defaults to the throttled real fetch. */
	get?: HttpGet;
	now?: number;
	/** YYYY-MM-DD for expiry maths (defaults to the UTC date of `now`). */
	today?: string;
};

const todayOf = (deps: MembershipDeps) => deps.today ?? new Date(deps.now ?? Date.now()).toISOString().slice(0, 10);

const UNAVAILABLE = (label: string) =>
	`${label}’s members directory isn’t reachable right now. Fill in your membership details yourself for now; staff at your dropzone can verify them.`;

/** HTTP for live calls: real/injected getter + a global hourly request budget stored in the DB. */
function liveGet(db: Database, provider: MembershipProvider, deps: MembershipDeps): HttpGet {
	const get = deps.get ?? createHttp();
	return async (url) => {
		const now = deps.now ?? Date.now();
		const hour = new Date(now).toISOString().slice(0, 13);
		const used = await cacheIncrement(db, `${provider.id}:budget:${hour}`, HOUR, now);
		if (used > HOURLY_BUDGET) throw new ProviderUnavailableError('Hourly lookup budget used up');
		return get(url);
	};
}

type CachedMember = { member: ProviderMember | null };

async function memberCached(
	db: Database,
	provider: MembershipProvider,
	number: string,
	deps: MembershipDeps,
	before?: () => Promise<void>
): Promise<{ member: ProviderMember | null; fetchedAt: number; cached: boolean }> {
	const now = deps.now ?? Date.now();
	const key = `${provider.id}:member:${number}`;
	const hit = await cacheGet<CachedMember>(db, key, now);
	if (hit) return { member: hit.value.member, fetchedAt: hit.fetchedAt, cached: true };
	await before?.();
	const member = await provider.fetchMember(number, liveGet(db, provider, deps));
	await cachePut(db, key, { member } satisfies CachedMember, member ? MEMBER_TTL : MISS_TTL, now);
	return { member, fetchedAt: now, cached: false };
}

/** Current-member numbers (null when the provider has no list or it can't be loaded and nothing is cached). */
export async function currentNumbers(db: Database, provider: MembershipProvider, deps: MembershipDeps = {}): Promise<Set<string> | null> {
	if (!provider.fetchCurrentNumbers) return null;
	const now = deps.now ?? Date.now();
	const key = `${provider.id}:current`;
	type Cached = { numbers: string[]; fetchedAt: number };
	const hit = await cacheGet<Cached>(db, key, now);
	if (hit && hit.fetchedAt > now - LIST_FRESH) return new Set(hit.value.numbers);
	try {
		const numbers = await provider.fetchCurrentNumbers(liveGet(db, provider, deps));
		await cachePut(db, key, { numbers, fetchedAt: now } satisfies Cached, LIST_KEEP, now);
		return new Set(numbers);
	} catch (e) {
		if (!(e instanceof ProviderUnavailableError)) throw e;
		if (!hit) return null;
		// A stale list (< 7 days old) beats nothing. Retry PASA in an hour, not on every call.
		const retryAt = now - LIST_FRESH + HOUR;
		await cachePut(db, key, hit.value, hit.value.fetchedAt + LIST_KEEP - retryAt, retryAt);
		return new Set(hit.value.numbers);
	}
}

export type LookupView = {
	provider: ProviderId;
	label: string;
	number: string;
	name: string;
	licence: string | null;
	dropzone: string | null;
	ratings: { rating: string; value: string | null }[];
	/** On the current members list (null = list unavailable). */
	current: boolean | null;
	/** Expiry implied by `current` (null when unknown). */
	expiry: string | null;
	nameMatch: NameMatch;
	fetchedAt: number;
};

async function userRow(db: Database, userId: string) {
	const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
	if (!u) throw new DomainError('not_found', 'User not found');
	return u;
}

/** Look one member up for the signed-in user (preview before connecting). */
export async function lookupMembership(
	db: Database,
	userId: string,
	input: { provider?: ProviderId; number: string },
	deps: MembershipDeps = {}
): Promise<LookupView> {
	const provider = getProvider(input.provider ?? 'pasa');
	const number = provider.normaliseNumber(input.number);
	if (!number) throw new DomainError('invalid', `Enter your ${provider.label} number — digits only, e.g. 4568.`);
	const now = deps.now ?? Date.now();
	const user = await userRow(db, userId);
	const cooldownKey = `${provider.id}:cooldown:${userId}`;
	let found;
	try {
		found = await memberCached(db, provider, number, deps, async () => {
			if (await cacheGet(db, cooldownKey, now)) {
				throw new DomainError('conflict', 'Please wait a few seconds before checking another number.', { reason: 'cooldown' });
			}
			await cachePut(db, cooldownKey, true, USER_COOLDOWN, now);
		});
	} catch (e) {
		if (e instanceof ProviderUnavailableError) throw new DomainError('conflict', UNAVAILABLE(provider.label), { reason: 'unavailable', cause: e.message });
		throw e;
	}
	if (!found.member) {
		throw new DomainError('not_found', `There was an error retrieving this membership info. Please double check the ${provider.label} member number.`);
	}
	const nums = await currentNumbers(db, provider, deps);
	const current = nums ? nums.has(number) : null;
	const m = found.member;
	return {
		provider: provider.id,
		label: provider.label,
		number,
		name: m.name,
		licence: m.licence,
		dropzone: m.dropzone,
		ratings: m.ratings,
		current,
		expiry: current === null ? null : provider.expiryFor(current, todayOf(deps)),
		nameMatch: compareNames(user.name, m.name),
		fetchedAt: found.fetchedAt
	};
}

export type ConnectResult = { status: MembershipCheck['status']; view: LookupView };

/** "Confirm & connect": record the check and, when the names match, apply it to the profile. */
export async function connectMembership(
	db: Database,
	userId: string,
	input: { provider?: ProviderId; number: string },
	deps: MembershipDeps = {}
): Promise<ConnectResult> {
	const view = await lookupMembership(db, userId, input, deps);
	if (view.current === null) {
		throw new DomainError('conflict', `${view.label}’s current members list couldn’t be loaded, so your membership status can’t be confirmed yet. Please try again later.`, {
			reason: 'unavailable'
		});
	}
	const taken = (
		await db
			.select({ userId: membershipChecks.userId })
			.from(membershipChecks)
			.where(
				and(
					eq(membershipChecks.provider, view.provider),
					eq(membershipChecks.number, view.number),
					inArray(membershipChecks.status, ['verified', 'lapsed']),
					ne(membershipChecks.userId, userId)
				)
			)
			.limit(1)
	)[0];
	if (taken) throw new DomainError('conflict', `This ${view.label} number is already connected to another account. Ask staff at your dropzone if this is a mistake.`);
	const now = deps.now ?? Date.now();
	const status: MembershipCheck['status'] = view.nameMatch !== 'match' ? 'needs_review' : view.current ? 'verified' : 'lapsed';
	const row = {
		userId,
		provider: view.provider,
		number: view.number,
		status,
		memberName: view.name,
		licence: view.licence,
		dropzone: view.dropzone,
		ratings: view.ratings,
		current: view.current,
		expiry: view.expiry,
		checkedAt: new Date(now),
		lastAttemptAt: new Date(now),
		reviewedBy: null,
		reviewedAt: null,
		expiredNotifiedAt: null,
		lastError: null
	};
	await db.insert(membershipChecks).values(row).onConflictDoUpdate({ target: membershipChecks.userId, set: row });
	if (status !== 'needs_review') await applyCheck(db, userId, row, now);
	return { status, view };
}

type Applicable = Pick<MembershipCheck, 'provider' | 'number' | 'licence' | 'ratings' | 'expiry'>;

async function applyCheck(db: Database, userId: string, c: Applicable, now: number): Promise<void> {
	const u = await userRow(db, userId);
	const association: Association = c.provider === 'pasa' ? (u.association === 'pasa_temp' || u.association === 'pasa_student' ? u.association : 'pasa') : 'uspa';
	await db
		.update(users)
		.set({
			association,
			associationNumber: c.number,
			associationExpiry: c.expiry ?? u.associationExpiry,
			licence: c.licence ?? u.licence,
			associationVerifiedAt: new Date(now),
			updatedAt: new Date(now)
		})
		.where(eq(users.id, userId));
	await setRatings(db, userId, c.provider, c.ratings, { verified: true, now });
}

/** Staff confirm (or decline) a link whose names didn't match. Caller checks capability + DZ membership. */
export async function reviewMembership(
	db: Database,
	input: { reviewerId: string; userId: string; approve: boolean; dropzoneName?: string },
	deps: MembershipDeps = {}
): Promise<MembershipCheck['status']> {
	const now = deps.now ?? Date.now();
	const c = (await db.select().from(membershipChecks).where(eq(membershipChecks.userId, input.userId)).limit(1))[0];
	if (!c || c.status !== 'needs_review') throw new DomainError('conflict', 'There is no membership link waiting for confirmation.');
	if (input.reviewerId === input.userId) throw new DomainError('forbidden', 'Another staff member has to confirm your own membership link.');
	const label = getProvider(c.provider).label;
	const status: MembershipCheck['status'] = !input.approve ? 'rejected' : c.current ? 'verified' : 'lapsed';
	await db
		.update(membershipChecks)
		.set({ status, reviewedBy: input.reviewerId, reviewedAt: new Date(now) })
		.where(eq(membershipChecks.userId, c.userId));
	if (input.approve) await applyCheck(db, c.userId, c, now);
	await notify(db, {
		userIds: [c.userId],
		type: 'general',
		actorUserId: input.reviewerId,
		now,
		payload: input.approve
			? { title: `${label} successfully connected`, body: `${input.dropzoneName ?? 'Your dropzone'} confirmed your ${label} membership ${c.number}.`, href: '/app/profile?tab=credentials' }
			: {
					title: `${label} link declined`,
					body: `Staff couldn’t match ${label} member ${c.number} to your profile. Check the number, or update your name to match your ${label} record.`,
					href: '/app/profile?tab=credentials'
				}
	});
	return status;
}

/** Remove the link: keeps the profile fields but drops the verified flags (ratings become self-declared). */
export async function disconnectMembership(db: Database, userId: string, now = Date.now()): Promise<void> {
	const c = (await db.select().from(membershipChecks).where(eq(membershipChecks.userId, userId)).limit(1))[0];
	await db.delete(membershipChecks).where(eq(membershipChecks.userId, userId));
	await db.update(users).set({ associationVerifiedAt: null, updatedAt: new Date(now) }).where(eq(users.id, userId));
	if (c) await db.update(userRatings).set({ verifiedAt: null }).where(and(eq(userRatings.userId, userId), eq(userRatings.body, c.provider)));
}

export async function getMembershipCheck(db: Database, userId: string): Promise<MembershipCheck | null> {
	return (await db.select().from(membershipChecks).where(eq(membershipChecks.userId, userId)).limit(1))[0] ?? null;
}

/**
 * Credentials the association owns while a link is active: the profile form can't overwrite them
 * (returns the stored values to keep), or null when nothing is locked.
 */
export async function lockedCredentials(db: Database, userId: string) {
	const c = await getMembershipCheck(db, userId);
	if (!c || (c.status !== 'verified' && c.status !== 'lapsed')) return null;
	const u = await userRow(db, userId);
	return { association: u.association, associationNumber: u.associationNumber, associationExpiry: u.associationExpiry, licence: u.licence };
}

export type RecheckSummary = { due: number; checked: number; renewed: number; expired: number; notified: number; errors: number; skipped?: string };

function addDays(day: string, n: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/**
 * Daily re-check (called from the hourly cron; each user at most once per ~day):
 * verified/lapsed links whose expiry is within EXPIRY_WINDOW_DAYS (or past) or last checked more
 * than REVERIFY_AFTER ago. Uses the once-a-day members list; member pages are re-fetched only for
 * the 30-day re-verification (ratings/licence), at most `limit` per run.
 */
export async function recheckMemberships(db: Database, deps: MembershipDeps & { limit?: number } = {}): Promise<RecheckSummary> {
	const now = deps.now ?? Date.now();
	const today = todayOf(deps);
	const limit = deps.limit ?? 10;
	const summary: RecheckSummary = { due: 0, checked: 0, renewed: 0, expired: 0, notified: 0, errors: 0 };
	const rows = await db
		.select({ check: membershipChecks, expiry: users.associationExpiry })
		.from(membershipChecks)
		.innerJoin(users, eq(users.id, membershipChecks.userId))
		.where(and(inArray(membershipChecks.status, ['verified', 'lapsed']), lt(membershipChecks.checkedAt, new Date(now - 20 * HOUR))))
		.orderBy(membershipChecks.checkedAt);
	const soon = addDays(today, EXPIRY_WINDOW_DAYS);
	const due = rows.filter((r) => (r.expiry ?? r.check.expiry ?? '0000-00-00') <= soon || r.check.checkedAt.getTime() < now - REVERIFY_AFTER);
	summary.due = due.length;
	if (due.length === 0) return summary;
	const lists = new Map<ProviderId, Set<string> | null>();
	let detailFetches = 0;
	for (const { check: c } of due) {
		if (summary.checked + summary.errors >= limit * 5) break;
		const provider = PROVIDERS[c.provider];
		if (!provider) continue;
		if (!lists.has(provider.id)) lists.set(provider.id, await currentNumbers(db, provider, deps));
		const nums = lists.get(provider.id);
		if (!nums) {
			summary.skipped = 'list_unavailable';
			summary.errors++;
			continue;
		}
		try {
			const current = nums.has(c.number);
			const expiry = provider.expiryFor(current, today);
			const patch: Partial<MembershipCheck> = { current, expiry, checkedAt: new Date(now), lastError: null, status: current ? 'verified' : 'lapsed' };
			if (c.checkedAt.getTime() < now - REVERIFY_AFTER && detailFetches < limit) {
				detailFetches++;
				const { member } = await memberCached(db, provider, c.number, deps);
				if (member) Object.assign(patch, { memberName: member.name, licence: member.licence, dropzone: member.dropzone, ratings: member.ratings });
				else patch.lastError = 'Member no longer found';
			}
			if (current) patch.expiredNotifiedAt = null;
			await db.update(membershipChecks).set(patch).where(eq(membershipChecks.userId, c.userId));
			const merged = { ...c, ...patch } as MembershipCheck;
			await applyCheck(db, c.userId, merged, now);
			summary.checked++;
			if (current && c.status === 'lapsed') summary.renewed++;
			if (!current && expiry < today) {
				summary.expired++;
				if (!c.expiredNotifiedAt) {
					await notify(db, {
						userIds: [c.userId],
						type: 'general',
						now,
						payload: {
							title: `${provider.label} membership expired`,
							body: `Your membership to ${provider.label} has expired. If you have paid, please reconnect to ${provider.label} with the app again.`,
							href: '/app/profile?tab=credentials'
						}
					});
					await db.update(membershipChecks).set({ expiredNotifiedAt: new Date(now) }).where(eq(membershipChecks.userId, c.userId));
					summary.notified++;
				}
			}
		} catch (e) {
			summary.errors++;
			await db
				.update(membershipChecks)
				.set({ lastError: e instanceof Error ? e.message.slice(0, 200) : 'error', checkedAt: new Date(now) })
				.where(eq(membershipChecks.userId, c.userId));
		}
	}
	return summary;
}

/** Short association name for warnings ("PASA expired"). */
export function associationShort(a: Association | null | undefined): string {
	if (!a) return 'Membership';
	return a.startsWith('pasa') ? 'PASA' : a === 'uspa' ? 'USPA' : ASSOCIATION_LABELS[a];
}

/** "PASA expired" when the membership ends before `day`, else null. */
export function membershipWarningFor(r: { association: Association | null; expiry: string | null }, day: string): string | null {
	return r.association && r.expiry && r.expiry < day ? `${associationShort(r.association)} expired` : null;
}

export type SlotPerson = { avatar: string | null; association: Association | null; expiry: string | null };

/** Avatar + membership facts for slot users in ONE users read (chunked for D1's 100-param cap). */
export async function slotPeople(db: Database, userIds: Iterable<string | null | undefined>): Promise<Map<string, SlotPerson>> {
	const ids = [...new Set([...userIds].filter((u): u is string => !!u))];
	const out = new Map<string, SlotPerson>();
	for (let i = 0; i < ids.length; i += 90) {
		const rows = await db
			.select({ id: users.id, avatar: users.avatar, association: users.association, expiry: users.associationExpiry })
			.from(users)
			.where(inArray(users.id, ids.slice(i, i + 90)));
		for (const { id, ...r } of rows) out.set(id, r);
	}
	return out;
}

/** `{ userId: "PASA expired" }` for users whose association membership ends before `day`. */
export async function membershipWarnings(db: Database, userIds: (string | null | undefined)[], day: string): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const [id, r] of await slotPeople(db, userIds)) {
		const w = membershipWarningFor(r, day);
		if (w) out[id] = w;
	}
	return out;
}

/** Link state per user for staff lists: verified / needs_review / … (absent = not connected). */
export async function membershipCheckStates(db: Database, userIds: string[]): Promise<Record<string, MembershipCheck['status']>> {
	const out: Record<string, MembershipCheck['status']> = {};
	for (let i = 0; i < userIds.length; i += 90) {
		const rows = await db
			.select({ id: membershipChecks.userId, status: membershipChecks.status })
			.from(membershipChecks)
			.where(inArray(membershipChecks.userId, userIds.slice(i, i + 90)));
		for (const r of rows) out[r.id] = r.status;
	}
	return out;
}

/**
 * Stamp `membershipWarning` on account-holder slots (manifest board/detail). Mutates and returns `loads`.
 * Pass `people` (from `slotPeople`) when the caller already read them, to skip the users query.
 */
export async function flagMembershipWarnings<L extends { day: string; slots: { userId: string | null; membershipWarning?: string | null }[] }>(
	db: Database,
	loads: L[],
	people?: Map<string, SlotPerson>
): Promise<L[]> {
	const known = people ?? (await slotPeople(db, loads.flatMap((l) => l.slots.map((s) => s.userId))));
	for (const l of loads)
		for (const s of l.slots) {
			const p = s.userId ? known.get(s.userId) : undefined;
			s.membershipWarning = p ? membershipWarningFor(p, l.day) : null;
		}
	return loads;
}
