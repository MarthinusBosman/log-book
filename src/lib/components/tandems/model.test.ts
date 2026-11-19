import { describe, expect, test } from 'bun:test';
import { addOnsSuffix, calendarDayLabel, extraToggleLabel, isFullyPaid, isUnpriced, tandemStage } from './model.ts';

describe('booking accessible names', () => {
	test('calendar days are spoken as dates, with singular/plural places', () => {
		expect(calendarDayLabel('2026-11-14', 1)).toBe('Saturday 14 November, 1 place left');
		expect(calendarDayLabel('2026-11-14', 12)).toBe('Saturday 14 November, 12 places left');
		expect(calendarDayLabel('2026-11-15', 0)).toBe('Sunday 15 November, unavailable');
	});

	test('extras toggles name the extra and, in a group, the jumper', () => {
		expect(extraToggleLabel('Handcam video', 'Max Mate')).toBe('Add Handcam video for Max Mate');
		expect(extraToggleLabel('Handcam video', null)).toBe('Add Handcam video');
	});

	test('booking summary names add-ons instead of a bare "+ N"', () => {
		expect(addOnsSuffix(0)).toBe('');
		expect(addOnsSuffix(1)).toBe(' + 1 add-on');
		expect(addOnsSuffix(3)).toBe(' + 3 add-ons');
	});
});

describe('unpriced bookings', () => {
	const base = { status: 'booked' as const, manifested: false, indemnitySignedAt: null };
	test('a booking with no price and no money taken is not shown as deposit paid', () => {
		// rows stored before the fix carry paymentStatus 'paid' for 0 of 0
		expect(isUnpriced({ totalMinor: 0, amountPaidMinor: 0 })).toBe(true);
		expect(tandemStage({ ...base, paymentStatus: 'paid', totalMinor: 0, amountPaidMinor: 0 })).toBe('booked');
	});
	test('money taken or a price set means it is priced', () => {
		expect(isUnpriced({ totalMinor: 0, amountPaidMinor: 320000 })).toBe(false);
		expect(isUnpriced({ totalMinor: 320000, amountPaidMinor: 0 })).toBe(false);
		expect(tandemStage({ ...base, paymentStatus: 'deposit_paid', totalMinor: 320000, amountPaidMinor: 50000 })).toBe('deposit_paid');
	});
	test('legacy unpriced rows stored as paid are not counted as paid', () => {
		expect(isFullyPaid({ paymentStatus: 'paid', totalMinor: 0, amountPaidMinor: 0 })).toBe(false);
		expect(isFullyPaid({ paymentStatus: 'paid', totalMinor: 320000, amountPaidMinor: 320000 })).toBe(true);
		expect(isFullyPaid({ paymentStatus: 'partially_paid', totalMinor: 320000, amountPaidMinor: 100 })).toBe(false);
	});
});
