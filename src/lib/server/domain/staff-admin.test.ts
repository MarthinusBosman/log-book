import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { checkins, dropzoneMembers, dropzones, users } from '../db/schema.ts';
import { isDomainError } from './errors.ts';
import { addSlot, addTandemGroup, completeLoad, createLoads } from './loads.ts';
import { createPassenger } from './tandems.ts';
import { adjust, topUp } from './wallet.ts';
import { createRig } from './gear.ts';
import { setRatings } from './profile.ts';
import { signIndemnity } from './indemnity.ts';
import { checkIn } from './checkins.ts';
import {
	gearAttention,
	gearRegister,
	inviteMember,
	jumperDetail,
	jumperDirectory,
	loadSheet,
	memberGearDue,
	revenueByItem,
	revenueFromSlots,
	staffOverview,
	tandemSummary,
	updateDropzoneSlug,
	walletFlows
} from './staff-admin.ts';
import { addDays } from './time.ts';
import { DAY, NOW, TEST_PRICES as P, freshDb, makeDropzone, makeMember, makeUser } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

/** One completed load with a tandem group, two sport jumpers and a pilot (staff pay to wallet on). */
async function busyDay() {
	const { dz, owner } = await makeDropzone(db, { walletEnabled: true, settings: { staffPayToWallet: true } });
	const pilot = await makeMember(db, dz.id, ['pilot'], { weightKg: 80 });
	const ti = await makeMember(db, dz.id, ['tandem_instructor', 'coach'], { name: 'Tina Instructor' });
	const a = await makeMember(db, dz.id, ['jumper'], { name: 'Alice Jumper', licence: 'C-123', associationNumber: '55501' });
	const b = await makeMember(db, dz.id, ['jumper'], { name: 'Bob Jumper' });
	await topUp(db, { userId: a.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash', createdBy: owner.id, now: NOW });
	const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 8, aircraftName: 'Caravan', pilotUserId: pilot.id, now: NOW });
	await addSlot(db, load.id, { userId: a.id, jumpType: 'belly', extras: ['extra_altitude'] }, { now: NOW });
	await addSlot(db, load.id, { userId: b.id, jumpType: 'belly' }, { now: NOW, skipWallet: true });
	const pax = await createPassenger(db, dz.id, { name: 'Pax', weightKg: 70, extras: ['handcam'], jumpDate: DAY });
	await addTandemGroup(db, { loadId: load.id, passengerId: pax.id, instructorUserId: ti.id });
	await completeLoad(db, load.id, { now: NOW + 3600_000 });
	return { dz, owner, pilot, ti, a, b, load, pax };
}

describe('inviteMember', () => {
	test('adds an existing user with several roles (idempotent) and creates password-less accounts for new emails', async () => {
		const { dz, owner } = await makeDropzone(db);
		const u = await makeUser(db, { email: 'existing@example.com' });
		const r1 = await inviteMember(db, { dropzoneId: dz.id, email: ' Existing@Example.com ', roles: ['rigger', 'pilot'], by: owner.id });
		expect(r1).toMatchObject({ userId: u.id, created: false, granted: ['rigger', 'pilot'] });
		const r2 = await inviteMember(db, { dropzoneId: dz.id, email: 'existing@example.com', roles: ['rigger'], by: owner.id });
		expect(r2.granted).toEqual([]);

		const r3 = await inviteMember(db, { dropzoneId: dz.id, email: 'new.person@example.com', name: 'New Person', roles: ['manifest'], by: owner.id });
		expect(r3.created).toBe(true);
		const created = (await db.select().from(users).where(eq(users.id, r3.userId)))[0];
		expect(created).toMatchObject({ name: 'New Person', passwordHash: null });
		const m = await db.select().from(dropzoneMembers).where(eq(dropzoneMembers.userId, r3.userId));
		expect(m[0].status).toBe('active');
	});

	test('validates email and roles', async () => {
		const { dz, owner } = await makeDropzone(db);
		const bad = await inviteMember(db, { dropzoneId: dz.id, email: 'nope', roles: ['admin'], by: owner.id }).catch((e) => e);
		expect(isDomainError(bad, 'invalid')).toBe(true);
		const none = await inviteMember(db, { dropzoneId: dz.id, email: 'x@example.com', roles: [], by: owner.id }).catch((e) => e);
		expect(isDomainError(none, 'invalid')).toBe(true);
	});
});

describe('staffOverview', () => {
	test('roles, ratings expiry, jumps, earnings and wallet-paid staff pay', async () => {
		const { dz, pilot, ti, a } = await busyDay();
		await setRatings(db, ti.id, 'pasa', [{ rating: 'Tandem', expiresOn: addDays(DAY, 10) }, { rating: 'Coach', expiresOn: addDays(DAY, -1) }]);
		const rows = await staffOverview(db, dz.id, DAY, DAY, DAY);
		expect(rows.find((r) => r.userId === a.id)).toBeUndefined(); // jumpers aren't staff
		const t = rows.find((r) => r.userId === ti.id)!;
		expect(t.roles.map((r) => r.role)).toEqual(['tandem_instructor', 'coach']);
		expect(t).toMatchObject({ jumps: 1, earnedMinor: P.pay_tandem! + P.pay_handcam!, paidToWalletMinor: P.pay_tandem! + P.pay_handcam!, owedMinor: 0 });
		expect(t.ratings.find((r) => r.rating === 'Coach')!.status).toBe('overdue');
		expect(t.ratings.find((r) => r.rating === 'Tandem')!.status).toBe('due_soon');
		const p = rows.find((r) => r.userId === pilot.id)!;
		expect(p).toMatchObject({ loadsFlown: 1, earnedMinor: P.pay_pilot! });
		// outside the period → nothing
		const later = await staffOverview(db, dz.id, addDays(DAY, 1), addDays(DAY, 5), DAY);
		expect(later.find((r) => r.userId === ti.id)!.jumps).toBe(0);
	});

	test('rejects bad ranges', async () => {
		const { dz } = await makeDropzone(db);
		const e = await staffOverview(db, dz.id, '2026-02-01', '2026-01-01', DAY).catch((x) => x);
		expect(isDomainError(e, 'invalid')).toBe(true);
	});
});

describe('jumpers', () => {
	test('directory: search by name / licence / association number, wallet, waiver, check-in', async () => {
		const { dz, a, b } = await busyDay();
		await db.update(dropzones).set({ indemnitySportActive: true }).where(eq(dropzones.id, dz.id));
		await signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: a.id, signerName: 'Alice Jumper', now: NOW });
		await checkIn(db, { dropzoneId: dz.id, userId: b.id, now: NOW });
		const all = await jumperDirectory(db, dz.id, DAY);
		const ra = all.find((r) => r.userId === a.id)!;
		expect(ra.waiver).toBe('signed');
		expect(ra.availableMinor).toBe(100000 - P.sport_slot! - P.extra_altitude!);
		const rb = all.find((r) => r.userId === b.id)!;
		expect(rb).toMatchObject({ waiver: 'missing', checkedIn: true, isStaff: false });
		expect((await jumperDirectory(db, dz.id, DAY, { search: 'alice' })).map((r) => r.userId)).toEqual([a.id]);
		expect((await jumperDirectory(db, dz.id, DAY, { search: 'C-123' })).map((r) => r.userId)).toEqual([a.id]);
		expect((await jumperDirectory(db, dz.id, DAY, { search: '55501' })).map((r) => r.userId)).toEqual([a.id]);
	});

	test('detail: ledger with creator names, recent slots; non-members are not found', async () => {
		const { dz, owner, a } = await busyDay();
		await adjust(db, { userId: a.id, dropzoneId: dz.id, amountMinor: -5000, reason: 'Correction', createdBy: owner.id, now: NOW + 7200_000 });
		const d = await jumperDetail(db, dz.id, a.id, DAY);
		expect(d.ledger[0]).toMatchObject({ type: 'adjustment', reason: 'Correction', createdByName: owner.name });
		expect(d.recent).toHaveLength(1);
		expect(d.recent[0]).toMatchObject({ loadNumber: 1, paid: true });
		const stranger = await makeUser(db);
		const e = await jumperDetail(db, dz.id, stranger.id, DAY).catch((x) => x);
		expect(isDomainError(e, 'not_found')).toBe(true);
	});
});

describe('gear', () => {
	test('register derives availability: grounded (inactive/overdue), in use (rental check-in), available', async () => {
		const { dz } = await makeDropzone(db);
		const ok = await createRig(db, { dropzoneId: dz.id }, { name: 'R1', reserveRepackedOn: addDays(DAY, -10) });
		const overdue = await createRig(db, { dropzoneId: dz.id }, { name: 'R2', reserveRepackedOn: addDays(DAY, -200) });
		const off = await createRig(db, { dropzoneId: dz.id }, { name: 'R3', reserveRepackedOn: addDays(DAY, -10), active: false });
		const used = await createRig(db, { dropzoneId: dz.id }, { name: 'R4', reserveRepackedOn: addDays(DAY, -10), aadServiceDueOn: addDays(DAY, 5) });
		const j = await makeMember(db, dz.id, ['jumper'], { name: 'Renter' });
		const c = await checkIn(db, { dropzoneId: dz.id, userId: j.id, gearRental: true, now: NOW });
		await db.update(checkins).set({ rentalRigId: used.id }).where(eq(checkins.id, c.id));
		const reg = await gearRegister(db, dz.id, DAY);
		const by = (id: string) => reg.find((r) => r.rig.id === id)!;
		expect(by(ok.id).availability).toBe('available');
		expect(by(overdue.id)).toMatchObject({ availability: 'grounded', groundedReason: 'Reserve repack overdue' });
		expect(by(off.id).availability).toBe('grounded');
		expect(by(used.id)).toMatchObject({ availability: 'in_use', inUseBy: 'Renter' });
		expect(by(used.id).aad.status).toBe('due_soon');
	});

	test('rigger view lists members personal rigs, most urgent first', async () => {
		const { dz } = await makeDropzone(db);
		const j1 = await makeMember(db, dz.id, ['jumper']);
		const j2 = await makeMember(db, dz.id, ['jumper']);
		const outsider = await makeUser(db);
		await createRig(db, { userId: j1.id }, { reserveRepackedOn: addDays(DAY, -20) });
		await createRig(db, { userId: j2.id }, { reserveRepackedOn: addDays(DAY, -190) });
		await createRig(db, { userId: outsider.id }, { reserveRepackedOn: addDays(DAY, -190) });
		const due = await memberGearDue(db, dz.id, DAY);
		expect(due.map((d) => d.owner.id)).toEqual([j2.id, j1.id]);
		expect(due[0].repack.status).toBe('overdue');
	});

	test('gearAttention counts like the gear page in one statement', async () => {
		const { dz } = await makeDropzone(db);
		await createRig(db, { dropzoneId: dz.id }, { name: 'OK', reserveRepackedOn: addDays(DAY, -10) });
		await createRig(db, { dropzoneId: dz.id }, { name: 'Soon', reserveRepackedOn: addDays(DAY, -170) });
		await createRig(db, { dropzoneId: dz.id }, { name: 'Overdue', reserveRepackedOn: addDays(DAY, -200) });
		await createRig(db, { dropzoneId: dz.id }, { name: 'Off', reserveRepackedOn: addDays(DAY, -10), active: false });
		await createRig(db, { dropzoneId: dz.id }, { name: 'AAD', reserveRepackedOn: addDays(DAY, -10), aadExpiresOn: addDays(DAY, 3) });
		const j1 = await makeMember(db, dz.id, ['jumper']);
		const j2 = await makeMember(db, dz.id, ['jumper']);
		const outsider = await makeUser(db);
		await createRig(db, { userId: j1.id }, { reserveRepackedOn: addDays(DAY, -20) });
		await createRig(db, { userId: j1.id }, { reserveRepackedOn: addDays(DAY, -190) });
		await createRig(db, { userId: j2.id }, { reserveRepackedOn: addDays(DAY, -10), aadServiceDueOn: addDays(DAY, -1) });
		await createRig(db, { userId: j2.id }, { reserveRepackedOn: addDays(DAY, -190), active: false });
		await createRig(db, { userId: outsider.id }, { reserveRepackedOn: addDays(DAY, -190) });
		const other = (await makeDropzone(db)).dz;
		await createRig(db, { dropzoneId: other.id }, { name: 'Elsewhere', reserveRepackedOn: addDays(DAY, -200) });

		const row = (await db.select().from(dropzones).where(eq(dropzones.id, dz.id)))[0];
		let statements = 0;
		const counting = new Proxy(db, { get: (t, p, r) => (p === 'select' ? (statements++, Reflect.get(t, p, r)) : Reflect.get(t, p, r)) });
		const got = await gearAttention(counting as Database, row, DAY);
		expect(got).toEqual({ dzRigs: 4, grounded: 2, memberRigs: 2 });
		// Same numbers as the gear page's register + jumpers' tab.
		const reg = await gearRegister(db, dz.id, DAY);
		expect(reg.filter((r) => r.availability === 'grounded')).toHaveLength(2);
		const mem = await memberGearDue(db, dz.id, DAY);
		expect(mem.filter((m) => [m.repack.status, m.aad.status].some((s) => s === 'due_soon' || s === 'overdue'))).toHaveLength(2);
		expect(statements).toBe(2); // the members subquery builder + the main select = one round trip
		expect(await gearAttention(db, (await db.select().from(dropzones).where(eq(dropzones.id, other.id)))[0], DAY)).toEqual({ dzRigs: 1, grounded: 1, memberRigs: 0 });
	});
});

describe('reports', () => {
	test('revenueFromSlots sums lines by code', () => {
		const r = revenueFromSlots([
			{ paid: true, totalMinor: 500, priceBreakdown: [{ code: 'sport_slot', label: 'x', amountMinor: 400 }, { code: 'gear_rental', label: 'y', amountMinor: 100 }] },
			{ paid: false, totalMinor: 400, priceBreakdown: [{ code: 'sport_slot', label: 'x', amountMinor: 400 }] }
		]);
		expect(r.totalMinor).toBe(900);
		expect(r.paidMinor).toBe(500);
		expect(r.items[0]).toMatchObject({ code: 'sport_slot', count: 2, amountMinor: 800, label: 'Sport slot' });
	});

	test('revenue by item, wallet flows, tandems and load sheet over a range', async () => {
		const { dz, owner, a } = await busyDay();
		const rev = await revenueByItem(db, dz.id, DAY, DAY);
		expect(rev.items.find((i) => i.code === 'sport_slot')!.count).toBe(2);
		expect(rev.items.find((i) => i.code === 'extra_altitude')!.amountMinor).toBe(P.extra_altitude!);
		expect(rev.items.some((i) => i.code === 'tandem_slot')).toBe(true);

		await adjust(db, { userId: a.id, dropzoneId: dz.id, amountMinor: 2500, reason: 'Credit', createdBy: owner.id, now: NOW });
		const flows = await walletFlows(db, dz.id, DAY, DAY);
		expect(flows.totals.topupMinor).toBe(100000);
		expect(flows.totals.chargeMinor).toBe(P.sport_slot! + P.extra_altitude!);
		expect(flows.totals.adjustmentMinor).toBe(2500);
		expect(flows.totals.staffPayMinor).toBe(P.pay_tandem! + P.pay_handcam! + P.pay_pilot!);
		expect(flows.topupsByProvider).toEqual([{ provider: 'cash', amountMinor: 100000 }]);
		expect((await walletFlows(db, dz.id, addDays(DAY, 1), addDays(DAY, 2))).days).toEqual([]);

		const t = await tandemSummary(db, dz.id, DAY, DAY);
		expect(t.passengers).toHaveLength(1);
		expect(t.byStatus.completed).toBe(1);
		expect(t.extras.handcam).toBe(1);

		const sheet = await loadSheet(db, dz.id, DAY);
		expect(sheet).toHaveLength(1);
		expect(sheet[0].slots).toHaveLength(4);
		expect(await loadSheet(db, dz.id, addDays(DAY, 1))).toEqual([]);
	});
});

describe('updateDropzoneSlug', () => {
	test('validates format and uniqueness', async () => {
		const { dz } = await makeDropzone(db);
		const { dz: other } = await makeDropzone(db);
		expect(await updateDropzoneSlug(db, dz.id, ' My-DZ ')).toBe('my-dz');
		expect(isDomainError(await updateDropzoneSlug(db, other.id, 'my-dz').catch((e) => e), 'conflict')).toBe(true);
		expect(isDomainError(await updateDropzoneSlug(db, other.id, 'bad slug!').catch((e) => e), 'invalid')).toBe(true);
		expect(await updateDropzoneSlug(db, dz.id, 'my-dz')).toBe('my-dz');
	});
});
