/**
 * Read models + small write helpers for the staff back-office (settings, staff, jumpers, gear,
 * reports). Pure TS on top of the schema; safe on D1 and bun:sqlite. Import directly:
 * `import * as staffAdmin from '#lib/server/domain/staff-admin.ts'`.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import {
	checkins,
	dropzoneMemberRoles,
	dropzoneMembers,
	dropzones,
	indemnitySignatures,
	ledgerEntries,
	loads,
	rigs,
	slots,
	tandemPassengers,
	userRatings,
	users,
	walletAccounts,
	type Load,
	type Rig,
	type Slot
} from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { normalizeEmail, validateEmail } from '../auth/users.ts';
import {
	PRICE_ITEMS,
	ROLE_PRECEDENCE,
	STAFF_ROLES,
	type DropzoneRole,
	type DueStatus,
	type LedgerType,
	type PriceCode
} from '../../domain/constants.ts';
import { DomainError, assertFound } from './errors.ts';
import { aadStatus, dueStatus, repackIntervalDays, repackStatus, DEFAULT_WARN_DAYS, type DueInfo } from './gear.ts';
import { grantRole } from './permissions.ts';
import { membershipStatus, type MembershipState } from './profile.ts';
import { addDays, isIsoDate, localDate } from './time.ts';

// ── helpers ─────────────────────────────────────────────────────────────────

function assertRange(from: string, to: string) {
	if (!isIsoDate(from) || !isIsoDate(to)) throw new DomainError('invalid', 'Dates must be YYYY-MM-DD');
	if (from > to) throw new DomainError('invalid', 'The start date must be before the end date');
}

const sortRoles = (roles: DropzoneRole[]) => roles.sort((a, b) => ROLE_PRECEDENCE.indexOf(a) - ROLE_PRECEDENCE.indexOf(b));

async function dzBasics(db: Database, dropzoneId: string) {
	return assertFound(
		(
			await db
				.select({
					id: dropzones.id,
					name: dropzones.name,
					timezone: dropzones.timezone,
					currency: dropzones.currency,
					country: dropzones.country,
					repackIntervalDays: dropzones.repackIntervalDays,
					indemnitySportActive: dropzones.indemnitySportActive,
					settings: dropzones.settings
				})
				.from(dropzones)
				.where(eq(dropzones.id, dropzoneId))
				.limit(1)
		)[0],
		'Dropzone'
	);
}

// ── members ─────────────────────────────────────────────────────────────────

/**
 * Invite (or add) someone by email with one or more roles. Existing accounts are added straight
 * away; unknown emails get a password-less account the person activates via the emailed
 * set-password link. Returns `created` so the caller knows to send that link.
 */
export async function inviteMember(
	db: Database,
	input: { dropzoneId: string; email: string; name?: string | null; roles: DropzoneRole[]; by: string; now?: number }
): Promise<{ userId: string; name: string; email: string; created: boolean; granted: DropzoneRole[] }> {
	const email = normalizeEmail(input.email);
	const err = validateEmail(email);
	if (err) throw new DomainError('invalid', err);
	if (input.roles.length === 0) throw new DomainError('invalid', 'Pick at least one role');
	const dz = await dzBasics(db, input.dropzoneId);
	let user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
	let created = false;
	if (!user) {
		const name = input.name?.trim() || email.split('@')[0];
		if (name.length > 120) throw new DomainError('invalid', 'Name is too long');
		user = (
			await db
				.insert(users)
				.values({ id: newId(), email, name, passwordHash: null, createdAt: new Date(input.now ?? Date.now()) })
				.returning()
		)[0];
		created = true;
	}
	// Re-activate a suspended / invited membership.
	await db
		.insert(dropzoneMembers)
		.values({ dropzoneId: input.dropzoneId, userId: user.id, status: 'active' })
		.onConflictDoUpdate({ target: [dropzoneMembers.dropzoneId, dropzoneMembers.userId], set: { status: 'active' } });
	const granted: DropzoneRole[] = [];
	for (const role of input.roles) {
		if (await grantRole(db, { dropzoneId: input.dropzoneId, userId: user.id, role, by: input.by, dropzoneName: dz.name })) {
			granted.push(role);
		}
	}
	return { userId: user.id, name: user.name, email: user.email, created, granted };
}

// ── staff overview ──────────────────────────────────────────────────────────

export type RatingInfo = { body: string; rating: string; expiresOn: string | null; verified: boolean; status: DueStatus; daysLeft: number | null };

export type StaffRow = {
	userId: string;
	name: string;
	avatar: string | null;
	email: string;
	licence: string | null;
	roles: { role: DropzoneRole; colour: string | null }[];
	ratings: RatingInfo[];
	membership: MembershipState;
	/** Staff slots worked on completed loads in the period. */
	jumps: number;
	/** Completed loads flown as pilot. */
	loadsFlown: number;
	earnedMinor: number;
	/** Staff pay already credited to the wallet in the period. */
	paidToWalletMinor: number;
	owedMinor: number;
};

/** Staff list with roles, ratings (expiry status) and jumps/earnings over a period (completed loads). */
export async function staffOverview(db: Database, dropzoneId: string, from: string, to: string, today: string): Promise<StaffRow[]> {
	assertRange(from, to);
	const dz = await dzBasics(db, dropzoneId);
	const warn = dz.settings.gearWarnDays ?? DEFAULT_WARN_DAYS;
	const roleRows = await db
		.select({
			userId: users.id,
			name: users.name,
			avatar: users.avatar,
			email: users.email,
			licence: users.licence,
			association: users.association,
			associationExpiry: users.associationExpiry,
			role: dropzoneMemberRoles.role,
			colour: dropzoneMemberRoles.colour
		})
		.from(dropzoneMemberRoles)
		.innerJoin(users, eq(users.id, dropzoneMemberRoles.userId))
		.innerJoin(
			dropzoneMembers,
			and(eq(dropzoneMembers.dropzoneId, dropzoneMemberRoles.dropzoneId), eq(dropzoneMembers.userId, dropzoneMemberRoles.userId))
		)
		.where(and(eq(dropzoneMemberRoles.dropzoneId, dropzoneId), ne(dropzoneMemberRoles.role, 'jumper')))
		.orderBy(asc(users.name));
	const by = new Map<string, StaffRow>();
	for (const r of roleRows) {
		const row =
			by.get(r.userId) ??
			({
				userId: r.userId,
				name: r.name,
				avatar: r.avatar,
				email: r.email,
				licence: r.licence,
				roles: [],
				ratings: [],
				membership: membershipStatus(r, today),
				jumps: 0,
				loadsFlown: 0,
				earnedMinor: 0,
				paidToWalletMinor: 0,
				owedMinor: 0
			} satisfies StaffRow);
		row.roles.push({ role: r.role, colour: r.colour });
		by.set(r.userId, row);
	}
	for (const row of by.values()) row.roles.sort((a, b) => ROLE_PRECEDENCE.indexOf(a.role) - ROLE_PRECEDENCE.indexOf(b.role));
	const ids = [...by.keys()];
	if (ids.length === 0) return [];

	const ratings = await db.select().from(userRatings).where(inArray(userRatings.userId, ids)).orderBy(asc(userRatings.rating));
	for (const r of ratings) {
		const d = dueStatus(r.expiresOn, today, warn);
		by.get(r.userId)?.ratings.push({
			body: r.body,
			rating: r.rating,
			expiresOn: r.expiresOn,
			verified: !!r.verifiedAt,
			status: r.expiresOn ? d.status : 'ok',
			daysLeft: d.daysLeft
		});
	}

	const worked = await db
		.select({ userId: slots.userId, pay: slots.staffPayMinor })
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.where(
			and(
				eq(slots.dropzoneId, dropzoneId),
				isNotNull(slots.staffRole),
				eq(loads.status, 'completed'),
				gte(loads.day, from),
				lte(loads.day, to)
			)
		);
	for (const w of worked) {
		const row = w.userId ? by.get(w.userId) : undefined;
		if (!row) continue;
		row.jumps++;
		row.earnedMinor += w.pay;
	}
	const flown = await db
		.select({ pilot: loads.pilotUserId, pay: loads.pilotPayMinor })
		.from(loads)
		.where(and(eq(loads.dropzoneId, dropzoneId), eq(loads.status, 'completed'), gte(loads.day, from), lte(loads.day, to), isNotNull(loads.pilotUserId)));
	for (const f of flown) {
		const row = f.pilot ? by.get(f.pilot) : undefined;
		if (!row) continue;
		row.loadsFlown++;
		row.earnedMinor += f.pay;
	}
	const credited = await ledgerInRange(db, dropzoneId, from, to, dz.timezone, ['staff_pay']);
	for (const e of credited) {
		const row = by.get(e.userId);
		if (row) row.paidToWalletMinor += e.amountMinor;
	}
	for (const row of by.values()) row.owedMinor = Math.max(0, row.earnedMinor - row.paidToWalletMinor);
	return [...by.values()];
}

// ── jumper directory ────────────────────────────────────────────────────────

export type WaiverState = 'signed' | 'missing' | 'not_required';

export type JumperRow = {
	userId: string;
	name: string;
	avatar: string | null;
	email: string;
	licence: string | null;
	association: string | null;
	associationNumber: string | null;
	membership: MembershipState;
	roles: DropzoneRole[];
	isStaff: boolean;
	waiver: WaiverState;
	waiverSignedAt: Date | null;
	availableMinor: number;
	pendingMinor: number;
	checkedIn: boolean;
	status: string;
};

/** Every member of the DZ with currency, waiver, wallet and check-in status. `search` matches name, email, licence, association no. */
export async function jumperDirectory(db: Database, dropzoneId: string, today: string, opts: { search?: string } = {}): Promise<JumperRow[]> {
	const dz = await dzBasics(db, dropzoneId);
	const rows = await db
		.select({
			userId: users.id,
			name: users.name,
			avatar: users.avatar,
			email: users.email,
			licence: users.licence,
			association: users.association,
			associationNumber: users.associationNumber,
			associationExpiry: users.associationExpiry,
			status: dropzoneMembers.status,
			role: dropzoneMemberRoles.role
		})
		.from(dropzoneMembers)
		.innerJoin(users, eq(users.id, dropzoneMembers.userId))
		.leftJoin(
			dropzoneMemberRoles,
			and(eq(dropzoneMemberRoles.dropzoneId, dropzoneMembers.dropzoneId), eq(dropzoneMemberRoles.userId, dropzoneMembers.userId))
		)
		.where(eq(dropzoneMembers.dropzoneId, dropzoneId))
		.orderBy(asc(users.name));
	const q = opts.search?.trim().toLowerCase();
	const by = new Map<string, JumperRow>();
	for (const r of rows) {
		if (q && ![r.name, r.email, r.licence, r.associationNumber].some((v) => v?.toLowerCase().includes(q))) continue;
		const row =
			by.get(r.userId) ??
			({
				userId: r.userId,
				name: r.name,
				avatar: r.avatar,
				email: r.email,
				licence: r.licence,
				association: r.association,
				associationNumber: r.associationNumber,
				membership: membershipStatus(r, today),
				roles: [],
				isStaff: false,
				waiver: dz.indemnitySportActive ? 'missing' : 'not_required',
				waiverSignedAt: null,
				availableMinor: 0,
				pendingMinor: 0,
				checkedIn: false,
				status: r.status
			} satisfies JumperRow);
		if (r.role && !row.roles.includes(r.role)) row.roles.push(r.role);
		by.set(r.userId, row);
	}
	const ids = [...by.keys()];
	if (ids.length === 0) return [];
	for (const row of by.values()) {
		sortRoles(row.roles);
		row.isStaff = row.roles.some((r) => STAFF_ROLES.includes(r));
	}
	const accounts = await db
		.select({ userId: walletAccounts.userId, a: walletAccounts.availableMinor, p: walletAccounts.pendingMinor })
		.from(walletAccounts)
		.where(and(eq(walletAccounts.dropzoneId, dropzoneId), inArray(walletAccounts.userId, ids)));
	for (const a of accounts) {
		const row = by.get(a.userId)!;
		row.availableMinor = a.a;
		row.pendingMinor = a.p;
	}
	const sigs = await db
		.select({ userId: indemnitySignatures.userId, signedAt: indemnitySignatures.signedAt })
		.from(indemnitySignatures)
		.where(and(eq(indemnitySignatures.dropzoneId, dropzoneId), eq(indemnitySignatures.audience, 'sport'), inArray(indemnitySignatures.userId, ids)));
	for (const s of sigs) {
		const row = s.userId ? by.get(s.userId) : undefined;
		if (!row) continue;
		if (!row.waiverSignedAt || s.signedAt > row.waiverSignedAt) row.waiverSignedAt = s.signedAt;
		row.waiver = 'signed';
	}
	const open = await db
		.select({ userId: checkins.userId })
		.from(checkins)
		.where(and(eq(checkins.dropzoneId, dropzoneId), isNull(checkins.checkedOutAt), inArray(checkins.userId, ids)));
	for (const o of open) by.get(o.userId)!.checkedIn = true;
	return [...by.values()];
}

/** Detail sheet: profile, roles, wallet + ledger (with who made each entry), recent slots at this DZ. */
export async function jumperDetail(db: Database, dropzoneId: string, userId: string, today: string) {
	const member = (
		await db
			.select({ status: dropzoneMembers.status })
			.from(dropzoneMembers)
			.where(and(eq(dropzoneMembers.dropzoneId, dropzoneId), eq(dropzoneMembers.userId, userId)))
			.limit(1)
	)[0];
	if (!member) throw new DomainError('not_found', 'This person is not a member of the dropzone');
	const user = assertFound((await db.select().from(users).where(eq(users.id, userId)).limit(1))[0], 'Jumper');
	const roles = sortRoles(
		(
			await db
				.select({ role: dropzoneMemberRoles.role })
				.from(dropzoneMemberRoles)
				.where(and(eq(dropzoneMemberRoles.dropzoneId, dropzoneId), eq(dropzoneMemberRoles.userId, userId)))
		).map((r) => r.role)
	);
	const account = (
		await db
			.select()
			.from(walletAccounts)
			.where(and(eq(walletAccounts.dropzoneId, dropzoneId), eq(walletAccounts.userId, userId)))
			.limit(1)
	)[0];
	const ledger = account
		? await db
				.select({ entry: ledgerEntries, createdByName: users.name })
				.from(ledgerEntries)
				.leftJoin(users, eq(users.id, ledgerEntries.createdBy))
				.where(eq(ledgerEntries.accountId, account.id))
				.orderBy(desc(ledgerEntries.createdAt))
				.limit(50)
		: [];
	const recent = await db
		.select({
			slotId: slots.id,
			day: loads.day,
			loadNumber: loads.loadNumber,
			loadStatus: loads.status,
			aircraft: loads.aircraftName,
			jumpType: slots.jumpType,
			staffRole: slots.staffRole,
			extras: slots.extras,
			totalMinor: slots.totalMinor,
			paid: slots.paid,
			paidVia: slots.paidVia
		})
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.where(and(eq(slots.dropzoneId, dropzoneId), eq(slots.userId, userId)))
		.orderBy(desc(loads.day), desc(loads.loadNumber))
		.limit(15);
	const ratings = await db.select().from(userRatings).where(eq(userRatings.userId, userId)).orderBy(asc(userRatings.rating));
	const waiver = (
		await db
			.select({ signedAt: indemnitySignatures.signedAt })
			.from(indemnitySignatures)
			.where(and(eq(indemnitySignatures.dropzoneId, dropzoneId), eq(indemnitySignatures.userId, userId), eq(indemnitySignatures.audience, 'sport')))
			.orderBy(desc(indemnitySignatures.signedAt))
			.limit(1)
	)[0];
	return {
		user: {
			id: user.id,
			name: user.name,
			avatar: user.avatar,
			email: user.email,
			phone: user.phone,
			licence: user.licence,
			association: user.association,
			associationNumber: user.associationNumber,
			associationExpiry: user.associationExpiry,
			weightKg: user.weightKg,
			loadingWeightKg: user.loadingWeightKg,
			emergencyName: user.emergencyName,
			emergencyPhone: user.emergencyPhone,
			declaredJumpCount: user.declaredJumpCount
		},
		status: member.status,
		roles,
		membership: membershipStatus(user, today),
		waiverSignedAt: waiver?.signedAt ?? null,
		account: account ?? null,
		ledger: ledger.map((l) => ({ ...l.entry, createdByName: l.createdByName })),
		recent,
		ratings: ratings.map((r) => ({ body: r.body, rating: r.rating, expiresOn: r.expiresOn, verified: !!r.verifiedAt }))
	};
}

// ── gear ────────────────────────────────────────────────────────────────────

export type RigAvailability = 'available' | 'in_use' | 'grounded';

export type GearRow = { rig: Rig; repack: DueInfo; aad: DueInfo; availability: RigAvailability; inUseBy: string | null; groundedReason: string | null };

/**
 * DZ rig register with due status and availability: grounded when deactivated or reserve/AAD
 * overdue; in use while assigned to an open check-in (gear rental); otherwise available.
 */
export async function gearRegister(db: Database, dropzoneId: string, today: string): Promise<GearRow[]> {
	const dz = await dzBasics(db, dropzoneId);
	const warnDays = dz.settings.gearWarnDays ?? DEFAULT_WARN_DAYS;
	const intervalDays = repackIntervalDays({ dropzoneDays: dz.repackIntervalDays, country: dz.country });
	const list = await db.select().from(rigs).where(eq(rigs.dropzoneId, dropzoneId)).orderBy(asc(rigs.name));
	const using = await db
		.select({ rigId: checkins.rentalRigId, name: users.name })
		.from(checkins)
		.innerJoin(users, eq(users.id, checkins.userId))
		.where(and(eq(checkins.dropzoneId, dropzoneId), isNull(checkins.checkedOutAt), isNotNull(checkins.rentalRigId)));
	const inUse = new Map(using.map((u) => [u.rigId!, u.name]));
	return list.map((rig) => {
		const repack = repackStatus(rig, { today, intervalDays, warnDays });
		const aad = aadStatus(rig, { today, warnDays });
		let groundedReason: string | null = null;
		if (!rig.active) groundedReason = 'Grounded by staff';
		else if (repack.status === 'overdue') groundedReason = 'Reserve repack overdue';
		else if (aad.status === 'overdue') groundedReason = 'AAD service overdue';
		const availability: RigAvailability = groundedReason ? 'grounded' : inUse.has(rig.id) ? 'in_use' : 'available';
		return { rig, repack, aad, availability, inUseBy: inUse.get(rig.id) ?? null, groundedReason };
	});
}

/** Rigger view: personal rigs of DZ members with repack / AAD status, most urgent first. */
export async function memberGearDue(db: Database, dropzoneId: string, today: string) {
	const dz = await dzBasics(db, dropzoneId);
	const warnDays = dz.settings.gearWarnDays ?? DEFAULT_WARN_DAYS;
	const intervalDays = repackIntervalDays({ dropzoneDays: dz.repackIntervalDays, country: dz.country });
	const rows = await db
		.select({ rig: rigs, owner: { id: users.id, name: users.name, avatar: users.avatar, email: users.email, phone: users.phone } })
		.from(rigs)
		.innerJoin(users, eq(users.id, rigs.userId))
		.innerJoin(dropzoneMembers, and(eq(dropzoneMembers.userId, rigs.userId), eq(dropzoneMembers.dropzoneId, dropzoneId)))
		.where(eq(rigs.active, true));
	const rank = (d: DueInfo) => d.daysLeft ?? 1e9;
	return rows
		.map((r) => {
			const repack = repackStatus(r.rig, { today, intervalDays, warnDays });
			const aad = aadStatus(r.rig, { today, warnDays });
			return { ...r, repack, aad, urgency: Math.min(rank(repack), rank(aad)) };
		})
		.sort((a, b) => a.urgency - b.urgency);
}

// ── reports ─────────────────────────────────────────────────────────────────

/** Ledger entries whose DZ-local date falls in [from, to]. */
export async function ledgerInRange(db: Database, dropzoneId: string, from: string, to: string, timezone: string, types?: LedgerType[]) {
	// Pad the UTC window by a day each side, then filter on the DZ-local date.
	const start = new Date(Date.parse(`${addDays(from, -1)}T00:00:00Z`));
	const end = new Date(Date.parse(`${addDays(to, 2)}T00:00:00Z`));
	const rows = await db
		.select()
		.from(ledgerEntries)
		.where(
			and(
				eq(ledgerEntries.dropzoneId, dropzoneId),
				gte(ledgerEntries.createdAt, start),
				lte(ledgerEntries.createdAt, end),
				types ? inArray(ledgerEntries.type, types) : undefined
			)
		)
		.orderBy(asc(ledgerEntries.createdAt));
	return rows
		.map((r) => ({ ...r, day: localDate(r.createdAt, timezone) }))
		.filter((r) => r.day >= from && r.day <= to);
}

export type WalletFlowDay = { day: string; topupMinor: number; chargeMinor: number; refundMinor: number; adjustmentMinor: number; staffPayMinor: number };

/** Wallet money in vs out per day (top-ups vs jump charges, plus refunds/adjustments/staff pay). */
export async function walletFlows(db: Database, dropzoneId: string, from: string, to: string) {
	assertRange(from, to);
	const dz = await dzBasics(db, dropzoneId);
	const rows = await ledgerInRange(db, dropzoneId, from, to, dz.timezone, ['topup', 'charge', 'refund', 'adjustment', 'staff_pay']);
	const days = new Map<string, WalletFlowDay>();
	const totals = { topupMinor: 0, chargeMinor: 0, refundMinor: 0, adjustmentMinor: 0, staffPayMinor: 0 };
	const key: Record<string, keyof typeof totals> = {
		topup: 'topupMinor',
		charge: 'chargeMinor',
		refund: 'refundMinor',
		adjustment: 'adjustmentMinor',
		staff_pay: 'staffPayMinor'
	};
	const byProvider = new Map<string, number>();
	for (const r of rows) {
		const d = days.get(r.day) ?? { day: r.day, topupMinor: 0, chargeMinor: 0, refundMinor: 0, adjustmentMinor: 0, staffPayMinor: 0 };
		d[key[r.type]] += r.amountMinor;
		totals[key[r.type]] += r.amountMinor;
		days.set(r.day, d);
		if (r.type === 'topup') byProvider.set(r.provider ?? 'other', (byProvider.get(r.provider ?? 'other') ?? 0) + r.amountMinor);
	}
	return {
		currency: dz.currency,
		days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
		totals,
		topupsByProvider: [...byProvider.entries()].map(([provider, amountMinor]) => ({ provider, amountMinor })).sort((a, b) => b.amountMinor - a.amountMinor)
	};
}

export type RevenueItem = { code: string; label: string; count: number; amountMinor: number };

/** Pure: sum slot price lines by price code (deposits are negative lines and are reported separately). */
export function revenueFromSlots(slotList: Pick<Slot, 'priceBreakdown' | 'paid' | 'totalMinor'>[]): { items: RevenueItem[]; totalMinor: number; paidMinor: number } {
	const by = new Map<string, RevenueItem>();
	let totalMinor = 0;
	let paidMinor = 0;
	for (const s of slotList) {
		totalMinor += s.totalMinor;
		if (s.paid) paidMinor += s.totalMinor;
		for (const line of s.priceBreakdown ?? []) {
			const label = PRICE_ITEMS[line.code as PriceCode]?.label ?? line.label;
			const it = by.get(line.code) ?? { code: line.code, label, count: 0, amountMinor: 0 };
			it.count++;
			it.amountMinor += line.amountMinor;
			by.set(line.code, it);
		}
	}
	return { items: [...by.values()].sort((a, b) => b.amountMinor - a.amountMinor), totalMinor, paidMinor };
}

/** Revenue by price item over completed loads in the range. */
export async function revenueByItem(db: Database, dropzoneId: string, from: string, to: string) {
	assertRange(from, to);
	const list = await db
		.select({ priceBreakdown: slots.priceBreakdown, paid: slots.paid, totalMinor: slots.totalMinor })
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.where(and(eq(slots.dropzoneId, dropzoneId), eq(loads.status, 'completed'), gte(loads.day, from), lte(loads.day, to)));
	return revenueFromSlots(list);
}

/** Tandem passengers whose jump date is in the range. */
export async function tandemSummary(db: Database, dropzoneId: string, from: string, to: string) {
	assertRange(from, to);
	const list = await db
		.select()
		.from(tandemPassengers)
		.where(and(eq(tandemPassengers.dropzoneId, dropzoneId), gte(tandemPassengers.jumpDate, from), lte(tandemPassengers.jumpDate, to)))
		.orderBy(asc(tandemPassengers.jumpDate), asc(tandemPassengers.bookingTime));
	const byStatus: Record<string, number> = {};
	const extras: Record<string, number> = {};
	let totalMinor = 0;
	let paidMinor = 0;
	let online = 0;
	for (const p of list) {
		byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
		if (p.status === 'cancelled') continue;
		totalMinor += p.totalMinor;
		paidMinor += p.amountPaidMinor;
		if (p.onlineBooking) online++;
		for (const e of p.extras ?? []) extras[e] = (extras[e] ?? 0) + 1;
	}
	return {
		passengers: list.map((p) => ({
			id: p.id,
			name: p.name,
			jumpDate: p.jumpDate,
			bookingTime: p.bookingTime,
			status: p.status,
			paymentStatus: p.paymentStatus,
			extras: p.extras,
			totalMinor: p.totalMinor,
			amountPaidMinor: p.amountPaidMinor,
			onlineBooking: p.onlineBooking,
			confirmationNumber: p.confirmationNumber
		})),
		byStatus,
		extras,
		online,
		totalMinor,
		paidMinor,
		outstandingMinor: Math.max(0, totalMinor - paidMinor)
	};
}

/** Loads (with slots) for a day — printable load sheet. Cancelled loads excluded. */
export async function loadSheet(db: Database, dropzoneId: string, day: string): Promise<(Load & { slots: Slot[] })[]> {
	if (!isIsoDate(day)) throw new DomainError('invalid', 'Date must be YYYY-MM-DD');
	const list = await db
		.select()
		.from(loads)
		.where(and(eq(loads.dropzoneId, dropzoneId), eq(loads.day, day), ne(loads.status, 'cancelled')))
		.orderBy(asc(loads.loadNumber));
	if (list.length === 0) return [];
	const all = await db
		.select()
		.from(slots)
		.where(inArray(slots.loadId, list.map((l) => l.id)))
		.orderBy(asc(slots.position), asc(slots.createdAt));
	return list.map((l) => ({ ...l, slots: all.filter((s) => s.loadId === l.id) }));
}

// ── dropzone profile ────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

/** Change the public slug (lowercase letters, digits, dashes; unique). Returns the new slug. */
export async function updateDropzoneSlug(db: Database, dropzoneId: string, slug: string): Promise<string> {
	const s = slug.trim().toLowerCase();
	if (!SLUG_RE.test(s)) throw new DomainError('invalid', 'Use 1–48 lowercase letters, numbers and dashes for the link name');
	const taken = (await db.select({ id: dropzones.id }).from(dropzones).where(eq(dropzones.slug, s)).limit(1))[0];
	if (taken && taken.id !== dropzoneId) throw new DomainError('conflict', 'That link name is already taken');
	await db.update(dropzones).set({ slug: s }).where(eq(dropzones.id, dropzoneId));
	return s;
}
