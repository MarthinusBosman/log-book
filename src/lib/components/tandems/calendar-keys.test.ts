import { describe, expect, test } from 'bun:test';
import { addDays, calendarKeyTarget, calendarTabDate } from './calendar-keys.ts';

// Wed 18, Sat 21, Sun 22, Wed 25 Nov; Wed 2 Dec; Sat 9 Jan.
const days = ['2026-11-25', '2026-11-18', '2026-11-21', '2026-11-22', '2026-12-02', '2027-01-09'];

describe('booking calendar keyboard', () => {
	test('addDays crosses month and year ends', () => {
		expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
		expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	test('one tab stop: focused, else selected, else first bookable day of the month', () => {
		expect(calendarTabDate(days, '2026-11', null, null)).toBe('2026-11-18');
		expect(calendarTabDate(days, '2026-11', null, '2026-11-22')).toBe('2026-11-22');
		expect(calendarTabDate(days, '2026-11', '2026-11-25', '2026-11-22')).toBe('2026-11-25');
		// Selection in another month doesn't count for this one.
		expect(calendarTabDate(days, '2026-12', '2026-11-25', '2026-11-22')).toBe('2026-12-02');
		expect(calendarTabDate(days, '2027-02', null, null)).toBeNull();
		// A focused/selected day that isn't bookable is ignored.
		expect(calendarTabDate(days, '2026-11', '2026-11-19', null)).toBe('2026-11-18');
	});

	test('left/right step between bookable days, across months', () => {
		expect(calendarKeyTarget(days, '2026-11-18', 'ArrowRight')).toBe('2026-11-21');
		expect(calendarKeyTarget(days, '2026-11-25', 'ArrowRight')).toBe('2026-12-02');
		expect(calendarKeyTarget(days, '2027-01-09', 'ArrowRight')).toBeNull();
		expect(calendarKeyTarget(days, '2026-11-21', 'ArrowLeft')).toBe('2026-11-18');
		expect(calendarKeyTarget(days, '2026-11-18', 'ArrowLeft')).toBeNull();
	});

	test('up/down go a week, else the nearest bookable day beyond it', () => {
		expect(calendarKeyTarget(days, '2026-11-18', 'ArrowDown')).toBe('2026-11-25');
		expect(calendarKeyTarget(days, '2026-11-21', 'ArrowDown')).toBe('2026-12-02');
		expect(calendarKeyTarget(days, '2026-11-25', 'ArrowUp')).toBe('2026-11-18');
		expect(calendarKeyTarget(days, '2026-11-22', 'ArrowUp')).toBeNull();
	});

	test('home/end stay in the month, page keys jump to the next month with a bookable day', () => {
		expect(calendarKeyTarget(days, '2026-11-22', 'Home')).toBe('2026-11-18');
		expect(calendarKeyTarget(days, '2026-11-22', 'End')).toBe('2026-11-25');
		expect(calendarKeyTarget(days, '2026-11-18', 'Home')).toBeNull();
		expect(calendarKeyTarget(days, '2026-11-22', 'PageDown')).toBe('2026-12-02');
		expect(calendarKeyTarget(days, '2026-12-02', 'PageDown')).toBe('2027-01-09');
		expect(calendarKeyTarget(days, '2027-01-09', 'PageUp')).toBe('2026-12-02');
		expect(calendarKeyTarget(days, '2026-12-02', 'PageUp')).toBe('2026-11-18');
		expect(calendarKeyTarget(days, '2026-11-25', 'PageUp')).toBeNull();
		expect(calendarKeyTarget(days, '2026-11-25', 'Tab')).toBeNull();
		expect(calendarKeyTarget([], '2026-11-25', 'ArrowRight')).toBeNull();
	});
});
