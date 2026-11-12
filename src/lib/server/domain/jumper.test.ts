import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { sessions, users } from '../db/schema.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { isDomainError } from './errors.ts';
import { addJump, countJumps, listJumps, logbookBreakdown } from './logbook.ts';
import { addSlot, createLoads, startCall, upcomingSlotsForUser, completeLoad } from './loads.ts';
import { cancelTopUpRequest, completeTopUpRequest, listPendingTopUpsForDropzone, listTopUpRequests, requestTopUp } from './payments.ts';
import { getAccount, listLedger } from './wallet.ts';
import { addRating, changePassword, listRatings, removeRating, setRatings, updateProfile } from './profile.ts';
import { dobProblem, localDate } from './time.ts';
import { parsePassengerForm } from '../tandems/forms.ts';
import { DAY, NOW, freshDb, makeDropzone, makeUser } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

describe('logbook filters + breakdown', () => {
	test('filters by type, dropzone, location, year range and search; counts with freefall', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		await addJump(db, u.id, { jumpDate: '2025-03-01', dropzoneId: dz.id, location: dz.name, jumpType: 'belly', freefallSeconds: 50 });
		await addJump(db, u.id, { jumpDate: '2026-01-10', location: 'Mossel Bay', jumpType: 'freefly', freefallSeconds: 45, description: 'Sunset load' });
		await addJump(db, u.id, { jumpDate: '2026-02-11', location: 'Mossel Bay', jumpType: 'belly', aircraft: 'King Air' });
		expect((await listJumps(db, u.id, { jumpType: 'belly' })).length).toBe(2);
		expect((await listJumps(db, u.id, { dropzoneId: dz.id })).length).toBe(1);
		expect((await listJumps(db, u.id, { location: 'Mossel Bay' })).length).toBe(2);
		expect((await listJumps(db, u.id, { from: '2026-01-01', to: '2026-12-31' })).length).toBe(2);
		expect((await listJumps(db, u.id, { q: 'sunset' })).map((j) => j.jumpType)).toEqual(['freefly']);
		expect((await listJumps(db, u.id, { q: 'king' })).length).toBe(1);
		expect(await countJumps(db, u.id)).toEqual({ count: 3, freefallSeconds: 95 });
		expect(await countJumps(db, u.id, { jumpType: 'freefly' })).toEqual({ count: 1, freefallSeconds: 45 });
	});

	test('breakdown groups by type, place (linked DZ name or free text) and year', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		const other = await makeUser(db);
		await addJump(db, u.id, { jumpDate: '2025-03-01', dropzoneId: dz.id, location: dz.name, jumpType: 'belly', freefallSeconds: 50 });
		await addJump(db, u.id, { jumpDate: '2026-03-01', dropzoneId: dz.id, location: dz.name, jumpType: 'belly', freefallSeconds: 40 });
		await addJump(db, u.id, { jumpDate: '2026-04-01', location: 'Mossel Bay', jumpType: 'freefly', freefallSeconds: 30 });
		await addJump(db, u.id, { jumpDate: '2026-04-02' });
		await addJump(db, other.id, { jumpDate: '2026-04-02', jumpType: 'wingsuit' });
		const b = await logbookBreakdown(db, u.id);
		expect(b.byType[0]).toEqual({ key: 'belly', label: 'belly', jumps: 2, freefallSeconds: 90 });
		expect(b.byType.map((t) => t.key).sort()).toEqual(['', 'belly', 'freefly']);
		expect(b.byDropzone[0]).toMatchObject({ key: `dz:${dz.id}`, label: dz.name, jumps: 2 });
		expect(b.byDropzone.find((p) => p.label === 'Mossel Bay')?.jumps).toBe(1);
		expect(b.byYear).toEqual([
			{ key: '2026', label: '2026', jumps: 3, freefallSeconds: 70 },
			{ key: '2025', label: '2025', jumps: 1, freefallSeconds: 50 }
		]);
	});
});

describe('upcoming slots', () => {
	test('returns the user’s unflown slots, called loads first', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		const [l1, l2, l3] = await createLoads(db, { dropzoneId: dz.id, day: DAY, count: 3, capacity: 4, now: NOW });
		await addSlot(db, l1.id, { userId: u.id, jumpType: 'belly' }, { now: NOW });
		await addSlot(db, l2.id, { userId: u.id, jumpType: 'belly' }, { now: NOW });
		await addSlot(db, l3.id, { userId: u.id, jumpType: 'belly' }, { now: NOW });
		await completeLoad(db, l1.id, { now: NOW });
		await startCall(db, l3.id, { now: NOW });
		const list = await upcomingSlotsForUser(db, u.id, DAY);
		expect(list.map((r) => r.load.loadNumber)).toEqual([3, 2]);
		expect(list[0].dropzone.name).toBe(dz.name);
		expect(await upcomingSlotsForUser(db, u.id, '2026-11-15')).toEqual([]);
	});
});

describe('top-up requests', () => {
	test('pay at manifest: request → pending → staff completes → wallet credited once', async () => {
		const { dz, owner } = await makeDropzone(db, { walletEnabled: true });
		const u = await makeUser(db);
		const req = await requestTopUp(db, { userId: u.id, dropzoneId: dz.id, amountMinor: 50000, provider: 'manual', now: NOW });
		expect(req).toMatchObject({ status: 'pending', purpose: 'wallet_topup', currency: 'ZAR' });
		expect((await listTopUpRequests(db, u.id, dz.id, { pendingOnly: true })).length).toBe(1);
		expect((await listPendingTopUpsForDropzone(db, dz.id))[0].user.id).toBe(u.id);
		const done = await completeTopUpRequest(db, { paymentId: req.id, by: owner.id, provider: 'cash', now: NOW });
		expect(done.status).toBe('succeeded');
		await completeTopUpRequest(db, { paymentId: req.id, by: owner.id, now: NOW }); // idempotent
		const acc = (await getAccount(db, u.id, dz.id))!;
		expect(acc.availableMinor).toBe(50000);
		expect((await listLedger(db, acc.id)).length).toBe(1);
		expect(await listPendingTopUpsForDropzone(db, dz.id)).toEqual([]);
	});

	test('validation, wallet disabled and cancel', async () => {
		const { dz } = await makeDropzone(db, { walletEnabled: true });
		const { dz: off } = await makeDropzone(db, { walletEnabled: false });
		const u = await makeUser(db);
		const other = await makeUser(db);
		await expect(requestTopUp(db, { userId: u.id, dropzoneId: dz.id, amountMinor: 0, provider: 'manual' })).rejects.toThrow(/valid amount/);
		try {
			await requestTopUp(db, { userId: u.id, dropzoneId: off.id, amountMinor: 100, provider: 'manual' });
			throw new Error('expected failure');
		} catch (e) {
			expect(isDomainError(e, 'wallet_disabled')).toBe(true);
		}
		const req = await requestTopUp(db, { userId: u.id, dropzoneId: dz.id, amountMinor: 100, provider: 'manual' });
		await expect(cancelTopUpRequest(db, req.id, other.id)).rejects.toThrow(/Not your/);
		await cancelTopUpRequest(db, req.id, u.id);
		await expect(completeTopUpRequest(db, { paymentId: req.id })).rejects.toThrow(/no longer pending/);
	});
});

describe('change password', () => {
	test('checks the current password, validates and signs out other sessions', async () => {
		const u = await makeUser(db, { passwordHash: await hashPassword('old-password-1') });
		const mk = (id: string) => ({ id, userId: u.id, expiresAt: new Date(NOW + 86_400_000), createdAt: new Date(NOW) });
		await db.insert(sessions).values([mk('keep'), mk('other')]);
		await expect(changePassword(db, { userId: u.id, current: 'nope', next: 'new-password-1' })).rejects.toThrow(/incorrect/);
		await expect(changePassword(db, { userId: u.id, current: 'old-password-1', next: 'x' })).rejects.toThrow();
		await changePassword(db, { userId: u.id, current: 'old-password-1', next: 'new-password-1', keepSessionId: 'keep' });
		const row = (await db.select().from(users).where(eq(users.id, u.id)))[0];
		expect((await verifyPassword(row.passwordHash!, 'new-password-1')).valid).toBe(true);
		expect((await db.select().from(sessions).where(eq(sessions.userId, u.id))).map((s) => s.id)).toEqual(['keep']);
	});
});

describe('date of birth sanity', () => {
	test('dobProblem rejects mangled years and future dates', () => {
		expect(dobProblem('1985-06-01', NOW)).toBeNull();
		expect(dobProblem('0505-02-01', NOW)).toMatch(/too far in the past/);
		expect(dobProblem(localDate(NOW + 10 * 86_400_000), NOW)).toMatch(/in the future/);
		expect(dobProblem('2020-13-40', NOW)).toMatch(/valid date/);
	});

	test('profile and passenger forms refuse a year like 0505', async () => {
		const u = await makeUser(db);
		await expect(updateProfile(db, u.id, { dob: '0505-02-01' }, NOW)).rejects.toThrow(/check the year/);
		await expect(updateProfile(db, u.id, { associationExpiry: 'soon' }, NOW)).rejects.toThrow(/Membership expiry/);
		expect((await updateProfile(db, u.id, { dob: '1990-02-01' }, NOW)).dob).toBe('1990-02-01');
		const f = new FormData();
		f.set('name', 'A');
		f.set('dob', '0505-02-01');
		expect(() => parsePassengerForm(f)).toThrow(/check the year/);
		f.set('dob', '1990-02-01');
		expect(parsePassengerForm(f).dob).toBe('1990-02-01');
	});
});

describe('self-declared ratings', () => {
	test('add (upsert), refuse to edit verified, remove own', async () => {
		const u = await makeUser(db);
		const other = await makeUser(db);
		const r = await addRating(db, u.id, { body: 'pasa', rating: 'Coach', expiresOn: '2027-01-01' });
		await addRating(db, u.id, { body: 'pasa', rating: 'Coach', expiresOn: '2027-06-01' });
		expect((await listRatings(db, u.id)).map((x) => [x.rating, x.expiresOn])).toEqual([['Coach', '2027-06-01']]);
		await expect(addRating(db, u.id, { body: 'pasa', rating: ' ' })).rejects.toThrow();
		await expect(addRating(db, u.id, { body: 'pasa', rating: 'X', expiresOn: '01/02/2027' })).rejects.toThrow();
		await setRatings(db, u.id, 'uspa', [{ rating: 'AFFI' }], { verified: true });
		const err = await addRating(db, u.id, { body: 'uspa', rating: 'AFFI' }).catch((e) => e);
		expect(isDomainError(err, 'conflict')).toBe(true);
		const verified = (await listRatings(db, u.id)).find((x) => x.body === 'uspa')!;
		expect(isDomainError(await removeRating(db, u.id, verified.id).catch((e) => e), 'conflict')).toBe(true);
		expect(isDomainError(await removeRating(db, other.id, r.id).catch((e) => e), 'not_found')).toBe(true);
		await removeRating(db, u.id, r.id);
		expect((await listRatings(db, u.id)).map((x) => x.rating)).toEqual(['AFFI']);
	});
});
