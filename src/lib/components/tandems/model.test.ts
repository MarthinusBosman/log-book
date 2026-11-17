import { describe, expect, test } from 'bun:test';
import { addOnsSuffix, calendarDayLabel, extraToggleLabel } from './model.ts';

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
