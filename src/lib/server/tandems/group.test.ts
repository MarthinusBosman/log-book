import { describe, expect, test } from 'bun:test';
import { DAY, freshDb, makeDropzone } from '../domain/testing.ts';
import { addBookingSlots, cancelPassenger, createOnlineBooking, getPassenger, recordTandemPayment } from '../domain/tandems.ts';
import { addDays } from '../domain/time.ts';
import { groupCodes, groupDue, loadGroup } from './group.ts';

const m = (id: string, totalMinor: number, amountPaidMinor = 0, status: 'booked' | 'cancelled' = 'booked') => ({ id, totalMinor, amountPaidMinor, status });

describe('groupCodes', () => {
	test('trims, upper-cases, dedupes and caps the list', () => {
		expect(groupCodes(' ab12-cd34 ,AB12-CD34,,x1,x2,x3,x4,x5')).toEqual(['AB12-CD34', 'X1', 'X2', 'X3']);
		expect(groupCodes(null)).toEqual([]);
	});
});

describe('groupDue', () => {
	test('a single unpaid booking offers deposit and balance (same as before)', () => {
		const d = groupDue([m('a', 3400_00)], 500_00);
		expect(d).toMatchObject({ balanceMinor: 3400_00, depositMinor: 500_00 });
		expect(d.allocations.deposit).toEqual([{ passengerId: 'a', amountMinor: 500_00 }]);
	});

	test('sums the group, skips cancelled and settled jumpers, no deposit for part-paid ones', () => {
		const d = groupDue([m('a', 3400_00), m('b', 4300_00, 500_00), m('c', 3400_00, 3400_00), m('d', 3400_00, 0, 'cancelled')], 500_00);
		expect(d.balanceMinor).toBe(3400_00 + 3800_00);
		expect(d.allocations.balance.map((a) => a.passengerId)).toEqual(['a', 'b']);
		expect(d.depositMinor).toBe(500_00);
		expect(d.allocations.deposit).toEqual([{ passengerId: 'a', amountMinor: 500_00 }]);
	});

	test('no deposit option when it would cover the whole balance or none is configured', () => {
		expect(groupDue([m('a', 400_00)], 500_00)).toMatchObject({ balanceMinor: 400_00, depositMinor: 0, allocations: { deposit: [] } });
		expect(groupDue([m('a', 3400_00), m('b', 3400_00)], 0).depositMinor).toBe(0);
		expect(groupDue([m('a', 3400_00, 3400_00)], 500_00)).toMatchObject({ balanceMinor: 0, allocations: { balance: [] } });
	});
});

describe('loadGroup', () => {
	test("returns the lead's group members only (same DZ and date, never the lead)", async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		const { dz: other } = await makeDropzone(db);
		const tomorrow = addDays(DAY, 1);
		for (const [d, date] of [
			[dz, DAY],
			[dz, tomorrow],
			[other, DAY]
		] as const) {
			await addBookingSlots(db, { dropzoneId: d.id, date, time: '09:00', capacity: 5 });
		}
		const res = await createOnlineBooking(db, { dropzoneId: dz.id, date: DAY, time: '09:00', jumpers: ['Ann', 'Ben', 'Cat'].map((name) => ({ name, email: 'x@example.com' })) });
		const [lead, ben, cat] = res.passengers;
		const later = (await createOnlineBooking(db, { dropzoneId: dz.id, date: tomorrow, time: '09:00', jumpers: [{ name: 'Dan', email: 'd@example.com' }] })).passengers[0];
		const elsewhere = (await createOnlineBooking(db, { dropzoneId: other.id, date: DAY, time: '09:00', jumpers: [{ name: 'Eve', email: 'e@example.com' }] })).passengers[0];
		const codes = [lead, ben, cat, later, elsewhere, ben].map((p) => p.confirmationNumber.toLowerCase()).join(',');
		const group = await loadGroup(db, lead, groupCodes(codes));
		expect(group.map((p) => p.name)).toEqual(['Ben', 'Cat']);

		// Paying for the group: the lead + Ben owe; Cat cancelled; Ben paid his deposit.
		await cancelPassenger(db, cat.id);
		await recordTandemPayment(db, { passengerId: ben.id, amountMinor: 100_00, provider: 'cash', isDeposit: true });
		const fresh = await Promise.all([lead, ben, cat].map(async (p) => (await getPassenger(db, p.id))!));
		const due = groupDue(fresh, 50_00);
		expect(due.allocations.balance.map((a) => a.passengerId)).toEqual([lead.id, ben.id]);
		expect(due.balanceMinor).toBe(fresh[0].totalMinor + fresh[1].totalMinor - 100_00);
	});
});
