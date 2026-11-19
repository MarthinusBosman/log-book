import { describe, expect, test } from 'bun:test';
import { DAY, NOW, freshDb, makeDropzone } from '../domain/testing.ts';
import { addBookingSlots, createOnlineBooking } from '../domain/tandems.ts';
import { addDays } from '../domain/time.ts';
import { BOOKING_HORIZON_DAYS, bookableDays, bookingOpensOn, nowTime } from './public.ts';

describe('bookableDays', () => {
	test("drops today's past times and fully booked days", async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		// NOW = 08:00Z = 10:00 in Johannesburg
		expect(nowTime(dz.timezone, NOW)).toBe('10:00');
		for (const time of ['09:00', '11:00']) await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time, capacity: 1, repeat: 'daily' });
		const tomorrow = addDays(DAY, 1);
		// fill both times tomorrow
		for (const time of ['09:00', '11:00']) {
			await createOnlineBooking(db, { dropzoneId: dz.id, date: tomorrow, time, jumpers: [{ name: `P ${time}`, email: 'p@example.com' }] });
		}
		const { today, days } = await bookableDays(db, dz, 3, NOW);
		expect(today).toBe(DAY);
		expect(days[DAY].map((s) => s.time)).toEqual(['11:00']);
		expect(days[tomorrow]).toBeUndefined();
		expect(days[addDays(DAY, 2)].map((s) => [s.time, s.remaining])).toEqual([
			['09:00', 1],
			['11:00', 1]
		]);
	});

	test('a slot shows on the booking page from bookingOpensOn(date)', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		const last = addDays(DAY, BOOKING_HORIZON_DAYS);
		const beyond = addDays(last, 1);
		for (const date of [last, beyond]) await addBookingSlots(db, { dropzoneId: dz.id, date, time: '09:00', capacity: 2 });
		const { days } = await bookableDays(db, dz, BOOKING_HORIZON_DAYS, NOW);
		expect(Object.keys(days)).toEqual([last]);
		expect(bookingOpensOn(last)).toBe(DAY);
		expect(bookingOpensOn(beyond)).toBe(addDays(DAY, 1));
		// The day it opens, it is bookable.
		const next = await bookableDays(db, dz, BOOKING_HORIZON_DAYS, NOW + 86_400_000);
		expect(Object.keys(next.days)).toEqual([last, beyond]);
	});
});
