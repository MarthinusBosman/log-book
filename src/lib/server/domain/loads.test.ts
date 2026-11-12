import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzoneFollows, dropzones, ledgerEntries, logbookJumps, notifications, slots, tandemPassengers } from '../db/schema.ts';
import { isDomainError } from './errors.ts';
import {
	addSlot,
	addSlots,
	addTandemGroup,
	assertFits,
	boardLoad,
	cancelCall,
	completeLoad,
	createLoads,
	departLoad,
	describeJump,
	getLoad,
	joinLoad,
	listLoadsForDay,
	loadStats,
	moveSlot,
	setLoadOpen,
	startCall
} from './loads.ts';
import { createAircraft } from './dropzone-admin.ts';
import { checkIn } from './checkins.ts';
import { createPassenger } from './tandems.ts';
import { getAccount } from './wallet.ts';
import { DAY, NOW, TEST_PRICES as P, freshDb, makeDropzone, makeMember, makeUser } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

const notes = (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId));

describe('pure rules', () => {
	test('stats include pilot weight; assertFits checks slots and weight', () => {
		const load = { capacity: 3, weightLimitKg: 300, pilotWeightKg: 80 };
		const s = loadStats(load, [{ weightKg: 90 }, { weightKg: 100 }]);
		expect(s).toMatchObject({ used: 2, free: 1, weightKg: 270, full: false, overweight: false });
		expect(() => assertFits(load, [{ weightKg: 90 }], [{ weightKg: 100 }, { weightKg: 20 }])).not.toThrow();
		expect(() => assertFits(load, [{ weightKg: 90 }, { weightKg: 100 }], [{ weightKg: 31 }])).toThrow(/weight limit/);
		expect(() => assertFits(load, [{ weightKg: 1 }, { weightKg: 1 }, { weightKg: 1 }], [{ weightKg: 1 }])).toThrow(/not enough slots/);
	});

	test('logbook descriptions', () => {
		expect(describeJump('belly', 4)).toBe('4 way Belly');
		expect(describeJump('freefly', 1)).toBe('Solo Freeflying');
		expect(describeJump('tandem', 2)).toBe('Tandem jump');
		expect(describeJump('tandem', 3, 'tandem_instructor')).toBe('Tandem jump (TI)');
		expect(describeJump('aff_1_3', 2, 'aff_instructor')).toBe('AFF 1-3 jump (AFF-I)');
	});
});

describe('creating loads', () => {
	test('numbers continue per day, restart on a new day; aircraft defaults copied; followers notified', async () => {
		const { dz, owner } = await makeDropzone(db);
		const plane = await createAircraft(db, dz.id, { name: 'Caravan', tailNumber: 'ZS-ABC', capacity: 16, weightLimitKg: 1500 });
		const fan = await makeUser(db);
		await db.insert(dropzoneFollows).values({ dropzoneId: dz.id, userId: fan.id });
		const a = await createLoads(db, { dropzoneId: dz.id, day: DAY, count: 3, aircraftId: plane.id, createdBy: owner.id, open: true });
		const b = await createLoads(db, { dropzoneId: dz.id, day: DAY, count: 2, capacity: 4, aircraftName: 'C182' });
		const c = await createLoads(db, { dropzoneId: dz.id, day: '2026-11-15', capacity: 4 });
		expect(a.map((l) => l.loadNumber)).toEqual([1, 2, 3]);
		expect(b.map((l) => l.loadNumber)).toEqual([4, 5]);
		expect(c[0].loadNumber).toBe(1);
		expect(a[0]).toMatchObject({ capacity: 16, weightLimitKg: 1500, aircraftName: 'Caravan', status: 'open', isOpen: true });
		expect(b[0]).toMatchObject({ capacity: 4, aircraftName: 'C182', status: 'planned' });
		const n = await notes(fan.id);
		expect(n.filter((x) => x.type === 'new_loads')).toHaveLength(3);
		expect(n[0].payload).toMatchObject({ count: 3, day: DAY, dropzoneName: dz.name });
		expect(await listLoadsForDay(db, dz.id, DAY)).toHaveLength(5);
		expect(await listLoadsForDay(db, dz.id, DAY, { onlyOpen: true })).toHaveLength(3);
	});

	test('validates date and capacity', async () => {
		const { dz } = await makeDropzone(db);
		await expect(createLoads(db, { dropzoneId: dz.id, day: 'nope', capacity: 4 })).rejects.toThrow(/date/);
		await expect(createLoads(db, { dropzoneId: dz.id, day: DAY })).rejects.toThrow(/capacity/);
	});
});

describe('manifest rules', () => {
	test('capacity: load full, all-or-nothing groups', async () => {
		const { dz } = await makeDropzone(db);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 2 });
		const [u1, u2, u3] = [await makeUser(db), await makeUser(db), await makeUser(db)];
		await addSlot(db, load.id, { userId: u1.id, jumpType: 'belly' });
		const err = await addSlots(db, load.id, [
			{ userId: u2.id, jumpType: 'belly' },
			{ userId: u3.id, jumpType: 'belly' }
		]).catch((e) => e);
		expect(isDomainError(err, 'load_full')).toBe(true);
		expect((await getLoad(db, load.id)).slots).toHaveLength(1);
		await addSlot(db, load.id, { userId: u2.id, jumpType: 'belly' });
		const full = await addSlot(db, load.id, { displayName: 'Walk-in', weightKg: 80, jumpType: 'belly' }).catch((e) => e);
		expect(isDomainError(full, 'load_full')).toBe(true);
	});

	test('weight limit includes the pilot', async () => {
		const { dz } = await makeDropzone(db);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4, weightLimitKg: 300, pilotName: 'Pat', pilotWeightKg: 90 });
		await addSlot(db, load.id, { displayName: 'A', weightKg: 100, jumpType: 'belly' });
		await addSlot(db, load.id, { displayName: 'B', weightKg: 100, jumpType: 'belly' });
		const err = await addSlot(db, load.id, { displayName: 'C', weightKg: 20, jumpType: 'belly' }).catch((e) => e);
		expect(isDomainError(err, 'overweight')).toBe(true);
		expect(err.details).toMatchObject({ weightKg: 310, weightLimitKg: 300 });
		await addSlot(db, load.id, { displayName: 'D', weightKg: 10, jumpType: 'belly' });
		expect((await getLoad(db, load.id)).stats.weightKg).toBe(300);
	});

	test('slot weight defaults to check-in weight, then loading weight', async () => {
		const { dz } = await makeDropzone(db);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4 });
		const a = await makeUser(db, { loadingWeightKg: 88 });
		const b = await makeUser(db, { loadingWeightKg: 70 });
		await checkIn(db, { dropzoneId: dz.id, userId: b.id, weightKg: 95 });
		expect((await addSlot(db, load.id, { userId: a.id, jumpType: 'belly' })).weightKg).toBe(88);
		expect((await addSlot(db, load.id, { userId: b.id, jumpType: 'belly' })).weightKg).toBe(95);
	});

	test('duplicates, expired membership, required check-in', async () => {
		const { dz } = await makeDropzone(db);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 6 });
		const u = await makeUser(db);
		await addSlot(db, load.id, { userId: u.id, jumpType: 'belly' });
		expect(isDomainError(await addSlot(db, load.id, { userId: u.id, jumpType: 'belly' }).catch((e) => e), 'already_on_load')).toBe(true);
		const expired = await makeUser(db, { association: 'pasa', associationExpiry: '2026-01-01' });
		expect(isDomainError(await addSlot(db, load.id, { userId: expired.id, jumpType: 'belly' }).catch((e) => e), 'membership_expired')).toBe(true);
		await addSlot(db, load.id, { userId: expired.id, jumpType: 'belly' }, { allowExpired: true });
		await db.update(dropzones).set({ settings: { requireCheckin: true } }).where(eq(dropzones.id, dz.id));
		const walkin = await makeUser(db);
		expect(isDomainError(await addSlot(db, load.id, { userId: walkin.id, jumpType: 'belly' }).catch((e) => e), 'not_checked_in')).toBe(true);
		await checkIn(db, { dropzoneId: dz.id, userId: walkin.id });
		await addSlot(db, load.id, { userId: walkin.id, jumpType: 'belly' });
	});

	test('self-manifest only on open loads; staff add notifies the jumper', async () => {
		const { dz, owner } = await makeDropzone(db);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 6 });
		const u = await makeUser(db);
		expect(isDomainError(await joinLoad(db, { loadId: load.id, userId: u.id, jumpType: 'belly' }).catch((e) => e), 'load_locked')).toBe(true);
		await setLoadOpen(db, load.id, true);
		await joinLoad(db, { loadId: load.id, userId: u.id, jumpType: 'belly' });
		expect(await notes(u.id)).toHaveLength(0); // self-manifest: no notification
		const v = await makeUser(db);
		await addSlot(db, load.id, { userId: v.id, jumpType: 'freefly' }, { by: owner.id });
		expect((await notes(v.id)).map((n) => n.type)).toEqual(['added_to_load']);
	});

	test('tandem group: passenger price minus deposit, TI pay incl. handcam, passenger manifested', async () => {
		const { dz } = await makeDropzone(db);
		const ti = await makeMember(db, dz.id, ['tandem_instructor']);
		const vid = await makeMember(db, dz.id, ['videographer']);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 5 });
		const pax = await createPassenger(db, dz.id, { name: 'Tanya Tandem', weightKg: 70, extras: ['handcam'], depositMinor: P.tandem_deposit!, jumpDate: DAY });
		const group = await addTandemGroup(db, { loadId: load.id, passengerId: pax.id, instructorUserId: ti.id, videographerUserId: vid.id });
		expect(group).toHaveLength(3);
		expect(new Set(group.map((s) => s.groupId)).size).toBe(1);
		const [p, t, v] = group;
		expect(p.totalMinor).toBe(P.tandem_slot! + P.tandem_handcam! - P.tandem_deposit!);
		expect(t).toMatchObject({ staffRole: 'tandem_instructor', totalMinor: 0, staffPayMinor: P.pay_tandem! + P.pay_handcam! });
		expect(v).toMatchObject({ staffRole: 'videographer', staffPayMinor: P.pay_tandem_video! });
		const after = (await db.select().from(tandemPassengers).where(eq(tandemPassengers.id, pax.id)))[0];
		expect(after).toMatchObject({ manifested: true, status: 'manifested' });
		const again = await addTandemGroup(db, { loadId: load.id, passengerId: pax.id, instructorUserId: ti.id }).catch((e) => e);
		expect(isDomainError(again, 'already_on_load')).toBe(true);
	});

	test('move slot checks the target load and notifies', async () => {
		const { dz, owner } = await makeDropzone(db);
		const [l1, l2] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 1, count: 2 });
		const [a, b] = [await makeUser(db), await makeUser(db)];
		const sa = await addSlot(db, l1.id, { userId: a.id, jumpType: 'belly' });
		await addSlot(db, l2.id, { userId: b.id, jumpType: 'belly' });
		expect(isDomainError(await moveSlot(db, sa.id, l2.id).catch((e) => e), 'load_full')).toBe(true);
		const [l3] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 2 });
		await moveSlot(db, sa.id, l3.id, { by: owner.id });
		expect((await getLoad(db, l3.id)).slots.map((s) => s.userId)).toEqual([a.id]);
		const n = (await notes(a.id)).find((x) => x.type === 'moved_load')!;
		expect(n.payload).toMatchObject({ fromLoadNumber: 1, loadNumber: 3 });
	});
});

describe('lifecycle', () => {
	test('20 min call sets the timer and notifies; invalid transitions refused', async () => {
		const { dz } = await makeDropzone(db);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4 });
		const u = await makeUser(db);
		await addSlot(db, load.id, { userId: u.id, jumpType: 'belly' });
		expect(isDomainError(await departLoad(db, load.id).catch((e) => e), 'invalid_transition')).toBe(true);
		const called = await startCall(db, load.id, { now: NOW });
		expect(called.status).toBe('called');
		expect(called.callDueAt!.getTime() - called.callStartedAt!.getTime()).toBe(20 * 60_000);
		expect((await notes(u.id)).map((n) => n.type)).toContain('call_20min');
		await cancelCall(db, load.id);
		expect((await getLoad(db, load.id)).callDueAt).toBeNull();
		await startCall(db, load.id, { now: NOW });
		await boardLoad(db, load.id, { now: NOW });
		await departLoad(db, load.id, NOW);
		const late = await addSlot(db, load.id, { displayName: 'Late', weightKg: 80, jumpType: 'belly' }).catch((e) => e);
		expect(isDomainError(late, 'load_locked')).toBe(true);
	});

	test('completion: logbook entries, pilot/staff pay, tandem completed, notifications, only once', async () => {
		const { dz } = await makeDropzone(db, { settings: { defaultAltitudeFt: 12000, staffPayToWallet: true } });
		const pilot = await makeMember(db, dz.id, ['pilot'], { weightKg: 85 });
		const ti = await makeMember(db, dz.id, ['tandem_instructor']);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 8, aircraftName: 'Caravan', pilotUserId: pilot.id });
		expect(load.pilotWeightKg).toBe(85);
		const [a, b, solo] = [await makeUser(db, { declaredJumpCount: 120 }), await makeUser(db), await makeUser(db)];
		await addSlots(db, load.id, [
			{ userId: a.id, jumpType: 'belly', groupId: 'g1' },
			{ userId: b.id, jumpType: 'belly', groupId: 'g1' }
		]);
		await addSlot(db, load.id, { userId: solo.id, jumpType: 'wingsuit' });
		const pax = await createPassenger(db, dz.id, { name: 'Pax', weightKg: 70 });
		await addTandemGroup(db, { loadId: load.id, passengerId: pax.id, instructorUserId: ti.id });

		const res = await completeLoad(db, load.id, { now: NOW });
		expect(res.logbookEntries).toBe(4); // a, b, solo, TI — not the passenger (no account)
		expect(res.load).toMatchObject({ status: 'completed', pilotPayMinor: P.pay_pilot! });

		const ja = (await db.select().from(logbookJumps).where(eq(logbookJumps.userId, a.id)))[0];
		expect(ja).toMatchObject({
			jumpNumber: 121,
			jumpDate: DAY,
			location: dz.name,
			dropzoneId: dz.id,
			aircraft: 'Caravan',
			altitudeFt: 12000,
			description: '2 way Belly',
			verified: true,
			source: 'load'
		});
		expect((await db.select().from(logbookJumps).where(eq(logbookJumps.userId, solo.id)))[0]).toMatchObject({ jumpNumber: 1, description: 'Solo Wingsuiting' });
		expect((await db.select().from(logbookJumps).where(eq(logbookJumps.userId, ti.id)))[0].description).toBe('Tandem jump (TI)');

		expect((await db.select().from(tandemPassengers).where(eq(tandemPassengers.id, pax.id)))[0].status).toBe('completed');
		expect((await notes(a.id)).map((n) => n.type)).toContain('load_completed');

		// staff pay credited to wallets (DZ setting)
		expect((await getAccount(db, ti.id, dz.id))!.availableMinor).toBe(P.pay_tandem!);
		expect((await getAccount(db, pilot.id, dz.id))!.availableMinor).toBe(P.pay_pilot!);
		const staffEntries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.userId, ti.id), eq(ledgerEntries.type, 'staff_pay')));
		expect(staffEntries).toHaveLength(1);

		const again = await completeLoad(db, load.id).catch((e) => e);
		expect(isDomainError(again, 'invalid_transition')).toBe(true);
		expect(await db.select().from(logbookJumps)).toHaveLength(4);
		expect(isDomainError(await addSlot(db, load.id, { displayName: 'x', jumpType: 'belly' }).catch((e) => e), 'load_locked')).toBe(true);
		expect(await db.select().from(slots).where(eq(slots.loadId, load.id))).toHaveLength(5);
	});
});
