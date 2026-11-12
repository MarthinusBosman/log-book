import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { freshDb, makeUser } from '../domain/testing.ts';
import { membershipChecks, notifications, userRatings, users } from '../db/schema.ts';
import { addRating, listRatings } from '../domain/profile.ts';
import { isDomainError } from '../domain/errors.ts';
import {
	HOURLY_BUDGET,
	connectMembership,
	disconnectMembership,
	getProvider,
	lockedCredentials,
	lookupMembership,
	membershipWarnings,
	recheckMemberships,
	reviewMembership
} from './service.ts';
import { compareNames } from './names.ts';
import { createHttp, resetThrottle, USER_AGENT } from './http.ts';
import { detailsFor, fakePasa } from './testing.ts';
import { ProviderUnavailableError } from './types.ts';

const NOW = Date.parse('2026-11-12T08:00:00Z');
const TODAY = '2026-11-12';
const H = 3_600_000;
const D = 24 * H;

const user = async (db: ReturnType<typeof freshDb>, name: string, patch = {}) => makeUser(db, { name, ...patch });
const code = async (p: Promise<unknown>) => {
	try {
		await p;
		return 'ok';
	} catch (e) {
		if (isDomainError(e)) return `${e.code}:${(e.details as { reason?: string } | undefined)?.reason ?? ''}`;
		throw e;
	}
};

describe('name matching', () => {
	test.each([
		['Thandi van der Berg', 'Thandi van der Berg', 'match'],
		['thandi VAN DER BERG', 'Thandi van der Berg', 'match'],
		['T van der Berg', 'Thandi van der Berg', 'match'],
		['Thandi Mary van der Berg', 'Thandi van der Berg', 'match'],
		['Mary Thandi van der Berg', 'Thandi van der Berg', 'match'],
		['José Müller', 'Jose Muller', 'match'],
		["Pieter O'Neil", 'Pieter ONeil', 'match'],
		['Thandi Smith', 'Thandi van der Berg', 'mismatch'],
		['Sipho van der Berg', 'Thandi van der Berg', 'mismatch'],
		['', 'Thandi van der Berg', 'mismatch']
	])('%s vs %s → %s', (a, b, want) => expect(compareNames(a, b)).toBe(want as 'match'));
});

describe('membership lookups', () => {
	beforeEach(() => resetThrottle());

	test('lookup shows the PASA record, current list → expiry 31 March; cached for 24h', async () => {
		const db = freshDb();
		const u = await user(db, 'Thandi van der Berg');
		const pasa = fakePasa();
		const v = await lookupMembership(db, u.id, { number: ' 9001 ' }, { get: pasa.get, now: NOW, today: TODAY });
		expect(v).toMatchObject({ number: '9001', name: 'Thandi van der Berg', licence: 'C9100', current: true, expiry: '2027-03-31', nameMatch: 'match' });
		expect(v.ratings.map((r) => r.rating)).toContain('Tandem');
		expect(pasa.detailCalls()).toBe(1);
		expect(pasa.listCalls()).toBe(1);
		// Same day, other user, same number: no new requests at all.
		const u2 = await user(db, 'Someone Else');
		await lookupMembership(db, u2.id, { number: '9001' }, { get: pasa.get, now: NOW + 5 * H, today: TODAY });
		expect(pasa.state.calls.length).toBe(2);
		// Next day: member page + list fetched again.
		await lookupMembership(db, u.id, { number: '9001' }, { get: pasa.get, now: NOW + D + 1, today: '2026-11-13' });
		expect(pasa.detailCalls()).toBe(2);
		expect(pasa.listCalls()).toBe(2);
	});

	test('invalid and unknown numbers, per-user cooldown', async () => {
		const db = freshDb();
		const u = await user(db, 'A Person');
		const pasa = fakePasa();
		const deps = { get: pasa.get, now: NOW, today: TODAY };
		expect(await code(lookupMembership(db, u.id, { number: 'abc' }, deps))).toBe('invalid:');
		expect(pasa.state.calls.length).toBe(0);
		expect(await code(lookupMembership(db, u.id, { number: '777' }, deps))).toBe('not_found:');
		// A second live lookup within 20 s is refused; the cached miss is answered without a request.
		expect(await code(lookupMembership(db, u.id, { number: '778' }, deps))).toBe('conflict:cooldown');
		expect(await code(lookupMembership(db, u.id, { number: '777' }, deps))).toBe('not_found:');
		expect(pasa.detailCalls()).toBe(1);
		expect(await code(lookupMembership(db, u.id, { number: '778' }, { ...deps, now: NOW + 21_000 }))).toBe('not_found:');
		expect(pasa.detailCalls()).toBe(2);
	});

	test('PASA down → friendly "unavailable" error; USPA not implemented', async () => {
		const db = freshDb();
		const u = await user(db, 'A Person');
		const pasa = fakePasa({ down: true });
		expect(await code(lookupMembership(db, u.id, { number: '9001' }, { get: pasa.get, now: NOW }))).toBe('conflict:unavailable');
		expect(() => getProvider('uspa')).toThrow(/isn’t available yet/);
	});

	test('global hourly budget stops live requests', async () => {
		const db = freshDb();
		const pasa = fakePasa();
		let last = 'ok';
		for (let i = 0; i <= HOURLY_BUDGET; i++) {
			const u = await user(db, `P ${i}`);
			last = await code(lookupMembership(db, u.id, { number: String(10_000 + i) }, { get: pasa.get, now: NOW + i }));
		}
		expect(last).toBe('conflict:unavailable');
		expect(pasa.state.calls.length).toBeLessThanOrEqual(HOURLY_BUDGET);
	});
});

describe('connect, review, disconnect', () => {
	beforeEach(() => resetThrottle());

	test('matching name → verified: flag, expiry, licence, PASA ratings (verified, replacing self-declared)', async () => {
		const db = freshDb();
		const u = await user(db, 'Thandi van der Berg', { licence: 'B-1' });
		await addRating(db, u.id, { body: 'pasa', rating: 'Coach' });
		await addRating(db, u.id, { body: 'other', rating: 'Wingsuit coach' });
		const pasa = fakePasa();
		const r = await connectMembership(db, u.id, { number: '9001' }, { get: pasa.get, now: NOW, today: TODAY });
		expect(r.status).toBe('verified');
		const me = (await db.select().from(users).where(eq(users.id, u.id)))[0];
		expect(me).toMatchObject({ association: 'pasa', associationNumber: '9001', associationExpiry: '2027-03-31', licence: 'C9100' });
		expect(me.associationVerifiedAt?.getTime()).toBe(NOW);
		const ratings = await listRatings(db, u.id);
		const pasaR = ratings.filter((x) => x.body === 'pasa');
		expect(pasaR.length).toBe(6);
		expect(pasaR.every((x) => x.verifiedAt?.getTime() === NOW)).toBe(true);
		expect(pasaR.find((x) => x.rating === 'Tandem')?.value).toBe('TM999 SG(E) ST(U) V(E)');
		expect(ratings.find((x) => x.body === 'other')?.rating).toBe('Wingsuit coach');
		expect(await lockedCredentials(db, u.id)).toMatchObject({ associationNumber: '9001', licence: 'C9100' });
		// Connecting reused the preview's cache.
		expect(pasa.detailCalls()).toBe(1);
	});

	test('keeps PASA Student/Temp association; not on current list → lapsed with last season expiry', async () => {
		const db = freshDb();
		const u = await user(db, "Pieter O'Neil", { association: 'pasa_student' });
		const r = await connectMembership(db, u.id, { number: '9002' }, { get: fakePasa().get, now: NOW, today: TODAY });
		expect(r.status).toBe('lapsed');
		const me = (await db.select().from(users).where(eq(users.id, u.id)))[0];
		expect(me).toMatchObject({ association: 'pasa_student', associationExpiry: '2026-03-31' });
		expect(me.associationVerifiedAt).not.toBeNull();
		expect(await membershipWarnings(db, [u.id, null], TODAY)).toEqual({ [u.id]: 'PASA expired' });
	});

	test('name mismatch → needs staff confirmation; approve applies, reject declines; both notify', async () => {
		const db = freshDb();
		const u = await user(db, 'Tee vdBerg');
		const staff = await user(db, 'Staff Member');
		const pasa = fakePasa();
		const r = await connectMembership(db, u.id, { number: '9001' }, { get: pasa.get, now: NOW, today: TODAY });
		expect(r.status).toBe('needs_review');
		let me = (await db.select().from(users).where(eq(users.id, u.id)))[0];
		expect(me.associationVerifiedAt).toBeNull();
		expect(await lockedCredentials(db, u.id)).toBeNull();
		expect(await code(reviewMembership(db, { reviewerId: u.id, userId: u.id, approve: true }))).toBe('forbidden:');
		expect(await reviewMembership(db, { reviewerId: staff.id, userId: u.id, approve: true, dropzoneName: 'Skydive Test' }, { now: NOW + 1000 })).toBe('verified');
		me = (await db.select().from(users).where(eq(users.id, u.id)))[0];
		expect(me.associationVerifiedAt?.getTime()).toBe(NOW + 1000);
		expect((await db.select().from(membershipChecks))[0].reviewedBy).toBe(staff.id);
		expect(await code(reviewMembership(db, { reviewerId: staff.id, userId: u.id, approve: true }))).toBe('conflict:');

		const v = await user(db, 'Wrong Person');
		await connectMembership(db, v.id, { number: '9002' }, { get: pasa.get, now: NOW + 30_000, today: TODAY });
		expect(await reviewMembership(db, { reviewerId: staff.id, userId: v.id, approve: false })).toBe('rejected');
		const notes = await db.select().from(notifications);
		expect(notes.map((n) => n.payload.title).sort()).toEqual(['PASA link declined', 'PASA successfully connected']);
		expect((await db.select().from(users).where(eq(users.id, v.id)))[0].associationVerifiedAt).toBeNull();
	});

	test('one PASA number cannot be connected to two accounts', async () => {
		const db = freshDb();
		const a = await user(db, 'Thandi van der Berg');
		const b = await user(db, 'Thandi van der Berg');
		const pasa = fakePasa();
		await connectMembership(db, a.id, { number: '9001' }, { get: pasa.get, now: NOW, today: TODAY });
		expect(await code(connectMembership(db, b.id, { number: '9001' }, { get: pasa.get, now: NOW, today: TODAY }))).toBe('conflict:');
	});

	test('connect needs the current list; disconnect drops verified flags but keeps data', async () => {
		const db = freshDb();
		const u = await user(db, 'Thandi van der Berg');
		const pasa = fakePasa();
		// Cache the member page, then take PASA down before the list is fetched.
		const realGet = pasa.get;
		let n = 0;
		const flaky = async (url: string) => {
			if (url.includes('MemberList') && n++ === 0) throw new ProviderUnavailableError('down');
			return realGet(url);
		};
		expect(await code(connectMembership(db, u.id, { number: '9001' }, { get: flaky, now: NOW, today: TODAY }))).toBe('conflict:unavailable');
		await connectMembership(db, u.id, { number: '9001' }, { get: flaky, now: NOW + 21_000, today: TODAY });
		await disconnectMembership(db, u.id, NOW + D);
		const me = (await db.select().from(users).where(eq(users.id, u.id)))[0];
		expect(me.associationVerifiedAt).toBeNull();
		expect(me.associationNumber).toBe('9001');
		expect((await db.select().from(userRatings)).every((r) => r.verifiedAt === null)).toBe(true);
		expect(await db.select().from(membershipChecks)).toEqual([]);
	});
});

describe('daily re-check', () => {
	beforeEach(() => resetThrottle());

	test('nothing due → no requests', async () => {
		const db = freshDb();
		const u = await user(db, 'Thandi van der Berg');
		const pasa = fakePasa();
		await connectMembership(db, u.id, { number: '9001' }, { get: pasa.get, now: NOW, today: TODAY });
		const before = pasa.state.calls.length;
		expect((await recheckMemberships(db, { get: pasa.get, now: NOW + 2 * D, today: '2026-11-14' })).due).toBe(0);
		expect(pasa.state.calls.length).toBe(before);
	});

	test('after 31 March: renewed members extend, lapsed ones expire and are notified once', async () => {
		const db = freshDb();
		const stays = await user(db, 'Thandi van der Berg');
		const leaves = await user(db, 'Sam Leaver');
		const pasa = fakePasa({ members: { '5555': detailsFor({ number: '5555', name: 'Sam Leaver' }) }, listed: ['5555'] });
		await connectMembership(db, stays.id, { number: '9001' }, { get: pasa.get, now: NOW, today: TODAY });
		await connectMembership(db, leaves.id, { number: '5555' }, { get: pasa.get, now: NOW + 21_000, today: TODAY });
		// 3 April 2027: 5555 didn't renew (dropped off the list).
		pasa.state.listed = [];
		const t = Date.parse('2027-04-03T03:00:00Z');
		const s = await recheckMemberships(db, { get: pasa.get, now: t, today: '2027-04-03' });
		expect(s).toMatchObject({ due: 2, checked: 2, expired: 1, notified: 1, errors: 0 });
		const get = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];
		expect((await get(stays.id)).associationExpiry).toBe('2028-03-31');
		expect((await get(leaves.id)).associationExpiry).toBe('2027-03-31');
		expect(await membershipWarnings(db, [stays.id, leaves.id], '2027-04-03')).toEqual({ [leaves.id]: 'PASA expired' });
		const n = await db.select().from(notifications).where(eq(notifications.userId, leaves.id));
		expect(n.map((x) => x.payload.title)).toEqual(['PASA membership expired']);
		// Next day: still lapsed, no second notification; the list is fetched once a day only.
		const lists = pasa.listCalls();
		const s2 = await recheckMemberships(db, { get: pasa.get, now: t + D, today: '2027-04-04' });
		expect(s2).toMatchObject({ due: 1, notified: 0, expired: 1 });
		expect(pasa.listCalls()).toBe(lists + 1);
		// Pays and reappears on the list → renewed.
		pasa.state.listed = ['5555'];
		const s3 = await recheckMemberships(db, { get: pasa.get, now: t + 2 * D + 1, today: '2027-04-05' });
		expect(s3).toMatchObject({ renewed: 1, expired: 0 });
		expect((await get(leaves.id)).associationExpiry).toBe('2028-03-31');
	});

	test('30-day re-verification refreshes the member page (ratings) within the per-run limit', async () => {
		const db = freshDb();
		const u = await user(db, 'Thandi van der Berg');
		const pasa = fakePasa();
		await connectMembership(db, u.id, { number: '9001' }, { get: pasa.get, now: NOW, today: TODAY });
		const details = pasa.detailCalls();
		const s = await recheckMemberships(db, { get: pasa.get, now: NOW + 31 * D, today: '2026-12-13' });
		expect(s.checked).toBe(1);
		expect(pasa.detailCalls()).toBe(details + 1);
		const c = (await db.select().from(membershipChecks))[0];
		expect(c.checkedAt.getTime()).toBe(NOW + 31 * D);
	});

	test('list unavailable → skip, nothing marked expired', async () => {
		const db = freshDb();
		const u = await user(db, 'Thandi van der Berg');
		const pasa = fakePasa();
		await connectMembership(db, u.id, { number: '9001' }, { get: pasa.get, now: NOW, today: TODAY });
		pasa.state.down = true;
		const t = Date.parse('2027-04-03T03:00:00Z');
		const s = await recheckMemberships(db, { get: pasa.get, now: t, today: '2027-04-03' });
		expect(s.skipped).toBe('list_unavailable');
		expect((await db.select().from(notifications)).length).toBe(0);
	});
});

describe('http', () => {
	test('identifies the app and spaces requests ≥1 s apart', async () => {
		resetThrottle();
		const clock = 1_000_000;
		const waits: number[] = [];
		const seen: (string | null)[] = [];
		const get = createHttp({
			now: () => clock,
			sleep: async (ms) => {
				waits.push(ms);
			},
			fetch: async (_u, init) => {
				seen.push(new Headers(init?.headers).get('user-agent'));
				return new Response('ok');
			}
		});
		await Promise.all([get('https://www.para.co.za/a'), get('https://www.para.co.za/b'), get('https://www.para.co.za/c')]);
		// Clock frozen: the 2nd and 3rd request wait for their 1 s slots.
		expect(waits).toEqual([1000, 2000]);
		expect(seen[0]).toBe(USER_AGENT);
		expect(USER_AGENT).toMatch(/Log-Book\/1\.0 \(\+https:\/\/log-book\.app/);
	});
});
