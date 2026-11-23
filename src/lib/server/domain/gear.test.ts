import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { notifications } from '../db/schema.ts';
import {
	aadStatus,
	createRig,
	dropzoneGearStatus,
	gearDateProblem,
	listServiceHistory,
	nextUserRepack,
	notifyRiggersOfDueRepacks,
	recordService,
	repackIntervalDays,
	repackStatus,
	reserveOverdueUsers,
	updateRig,
	wingLoading,
	getRig
} from './gear.ts';
import { freshDb, makeDropzone, makeMember, makeUser } from './testing.ts';

const TODAY = '2026-11-14';

describe('repack due (pure)', () => {
	test('default 180 days; ok / due_soon / overdue / unknown', () => {
		expect(repackStatus({ reserveRepackedOn: '2026-10-01', repackIntervalDays: null }, { today: TODAY })).toEqual({
			dueOn: '2027-03-30',
			daysLeft: 136,
			status: 'ok'
		});
		expect(repackStatus({ reserveRepackedOn: '2026-06-01', repackIntervalDays: null }, { today: TODAY })).toMatchObject({
			dueOn: '2026-11-28',
			daysLeft: 14,
			status: 'due_soon'
		});
		expect(repackStatus({ reserveRepackedOn: '2026-05-01', repackIntervalDays: null }, { today: TODAY })).toMatchObject({
			status: 'overdue',
			daysLeft: -17
		});
		expect(repackStatus({ reserveRepackedOn: null, repackIntervalDays: null }, { today: TODAY }).status).toBe('unknown');
	});

	test('due exactly today is due_soon, the day after is overdue', () => {
		expect(repackStatus({ reserveRepackedOn: '2026-05-18', repackIntervalDays: null }, { today: TODAY })).toMatchObject({ daysLeft: 0, status: 'due_soon' });
		expect(repackStatus({ reserveRepackedOn: '2026-05-17', repackIntervalDays: null }, { today: TODAY }).status).toBe('overdue');
	});

	test('interval precedence: rig → dropzone → country → 180', () => {
		expect(repackIntervalDays({})).toBe(180);
		expect(repackIntervalDays({ country: 'za' })).toBe(180);
		expect(repackIntervalDays({ country: 'ZA', dropzoneDays: 120 })).toBe(120);
		expect(repackIntervalDays({ rig: { repackIntervalDays: 365 }, dropzoneDays: 120 })).toBe(365);
		expect(repackStatus({ reserveRepackedOn: '2026-01-01', repackIntervalDays: 365 }, { today: TODAY }).status).toBe('ok');
		expect(repackStatus({ reserveRepackedOn: '2026-01-01', repackIntervalDays: null }, { today: TODAY, intervalDays: 365, warnDays: 60 }).status).toBe('due_soon');
	});

	test('AAD: earliest of service due / end of life', () => {
		expect(aadStatus({ aadServiceDueOn: '2027-06-01', aadExpiresOn: '2026-12-01' }, { today: TODAY })).toMatchObject({ dueOn: '2026-12-01', status: 'due_soon' });
		expect(aadStatus({ aadServiceDueOn: null, aadExpiresOn: null }, { today: TODAY }).status).toBe('unknown');
	});

	test('wing loading lb/sqft', () => {
		expect(wingLoading(90, 170)).toBe(1.17);
		expect(wingLoading(null, 170)).toBeNull();
	});
});

describe('gear (db)', () => {
	let db: Database;
	beforeEach(() => {
		db = freshDb();
	});

	test('repack date required; service history moves the repack date', async () => {
		const u = await makeUser(db);
		await expect(createRig(db, { userId: u.id }, { container: 'Javelin' })).rejects.toThrow(/repack/);
		const rig = await createRig(db, { userId: u.id }, { container: 'Javelin', mainCanopy: 'Sabre3 170', reserveRepackedOn: '2026-05-01' });
		expect(rig.kind).toBe('personal');
		expect((await nextUserRepack(db, u.id, TODAY)).status).toBe('overdue');
		await recordService(db, { rigId: rig.id, kind: 'reserve_repack', performedOn: '2026-11-10', performedByName: 'Rita Rigger' });
		await recordService(db, { rigId: rig.id, kind: 'reserve_repack', performedOn: '2026-01-01' }); // older entry: history only
		await recordService(db, { rigId: rig.id, kind: 'aad_service', performedOn: '2026-11-10', nextDueOn: '2030-11-10' });
		const after = (await getRig(db, rig.id))!;
		expect(after.reserveRepackedOn).toBe('2026-11-10');
		expect(after.aadServiceDueOn).toBe('2030-11-10');
		expect(await listServiceHistory(db, rig.id)).toHaveLength(3);
		expect((await nextUserRepack(db, u.id, TODAY)).status).toBe('ok');
	});

	test('gear dates: mangled or future years are rejected with plain messages', async () => {
		const now = Date.parse('2026-11-12T10:00:00Z');
		expect(gearDateProblem('reserveRepackedOn', '2026-11-12', now)).toBeNull();
		expect(gearDateProblem('reserveRepackedOn', '2026-11-13', now)).toBeNull(); // time-zone slack
		expect(gearDateProblem('reserveRepackedOn', '0101-05-01', now)).toBe('Last repack date is too far in the past: check the year');
		expect(gearDateProblem('reserveRepackedOn', '2062-05-01', now)).toBe('Last repack date is in the future: check the year');
		expect(gearDateProblem('performedOn', '2026-12-01', now)).toBe('Service date is in the future: check the year');
		expect(gearDateProblem('aadExpiresOn', '2038-01-01', now)).toBeNull();
		expect(gearDateProblem('aadServiceDueOn', '2202-01-01', now)).toBe('Next AAD service date is too far in the future: check the year');
		expect(gearDateProblem('nextDueOn', 'soon', now)).toBe('Next due date must be a valid date');

		const u = await makeUser(db);
		const base = { container: 'Javelin', mainCanopy: 'Sabre3 170' };
		await expect(createRig(db, { userId: u.id }, { ...base, reserveRepackedOn: '0202-05-01' }, now)).rejects.toThrow('Last repack date is too far in the past: check the year');
		await expect(createRig(db, { userId: u.id }, { ...base, reserveRepackedOn: '2027-05-01' }, now)).rejects.toThrow(/in the future/);
		const rig = await createRig(db, { userId: u.id }, { ...base, reserveRepackedOn: '2026-05-01', aadExpiresOn: '2035-01-01' }, now);
		await expect(updateRig(db, rig.id, { aadServiceDueOn: '0027-01-01' }, now)).rejects.toThrow(/Next AAD service date/);
		await expect(recordService(db, { rigId: rig.id, kind: 'reserve_repack', performedOn: '2206-11-10', now })).rejects.toThrow('Service date is in the future: check the year');
		await expect(recordService(db, { rigId: rig.id, kind: 'aad_service', performedOn: '2026-11-10', nextDueOn: '3030-11-10', now })).rejects.toThrow(/Next due date/);
		expect((await getRig(db, rig.id))!.reserveRepackedOn).toBe('2026-05-01');
		expect(await listServiceHistory(db, rig.id)).toHaveLength(0);
	});

	test('dropzone gear status uses the DZ interval; riggers get notified', async () => {
		const { dz } = await makeDropzone(db, { repackIntervalDays: 120 });
		const rigger = await makeMember(db, dz.id, ['rigger']);
		await createRig(db, { dropzoneId: dz.id }, { kind: 'tandem', name: 'Tandem 1', reserveRepackedOn: '2026-07-20' }); // due 2026-11-17
		await createRig(db, { dropzoneId: dz.id }, { kind: 'rental', name: 'Rental 1', reserveRepackedOn: '2026-11-01' });
		const status = await dropzoneGearStatus(db, dz.id, TODAY);
		expect(status.map((s) => [s.rig.name, s.repack.status])).toEqual([
			['Tandem 1', 'due_soon'],
			['Rental 1', 'ok']
		]);
		expect(await notifyRiggersOfDueRepacks(db, dz.id, TODAY)).toBe(1);
		const n = await db.select().from(notifications).where(eq(notifications.userId, rigger.id));
		expect(n[0]).toMatchObject({ type: 'repack_due' });
		expect(n[0].payload).toMatchObject({ rig: 'Tandem 1' });
	});

	test('reserveOverdueUsers: only jumpers whose every active personal rig is past its repack date', async () => {
		const NOW = Date.parse('2026-11-14T08:00:00Z');
		const rig = (userId: string, input: Parameters<typeof createRig>[2]) => createRig(db, { userId }, { container: 'Javelin', ...input }, NOW);
		const [lapsed, mixed, override, retired, none, dzShorter] = await Promise.all(Array.from({ length: 6 }, () => makeUser(db)));
		await rig(lapsed.id, { reserveRepackedOn: '2026-05-01' }); // due 2026-10-28
		await rig(mixed.id, { reserveRepackedOn: '2026-05-01' });
		await rig(mixed.id, { reserveRepackedOn: '2026-10-01' }); // a current second rig
		await rig(override.id, { reserveRepackedOn: '2026-05-01', repackIntervalDays: 365 });
		await rig(retired.id, { reserveRepackedOn: '2026-05-01', active: false });
		await rig(dzShorter.id, { reserveRepackedOn: '2026-07-01' }); // ok at 180 days, overdue at 120
		const ids = [lapsed, mixed, override, retired, none, dzShorter].map((u) => u.id);

		const za = await reserveOverdueUsers(db, { country: 'ZA', repackIntervalDays: null }, [...ids, null], TODAY);
		expect([...za]).toEqual([lapsed.id]);
		// judged on the given day: the load day, not today
		expect([...(await reserveOverdueUsers(db, { country: 'ZA', repackIntervalDays: null }, ids, '2026-10-28'))]).toEqual([]);
		const short = await reserveOverdueUsers(db, { country: 'ZA', repackIntervalDays: 120 }, ids, TODAY);
		expect(new Set(short)).toEqual(new Set([lapsed.id, dzShorter.id]));
		expect((await reserveOverdueUsers(db, { country: 'ZA', repackIntervalDays: null }, [], TODAY)).size).toBe(0);
	});
});
