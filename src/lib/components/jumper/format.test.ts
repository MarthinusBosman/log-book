import { describe, expect, test } from 'bun:test';
import { fmtFreefall, loggedScope } from './format.ts';

describe('loggedScope', () => {
	test('nothing to say when every jump is logged', () => {
		expect(loggedScope({ logged: 7, totalJumps: 7 })).toBeUndefined();
		expect(loggedScope({ logged: 0, totalJumps: 0 })).toBeUndefined();
	});

	test('explains that stats cover only the logged jumps', () => {
		expect(loggedScope({ logged: 7, totalJumps: 181 })).toEqual({
			short: '7 logged jumps',
			long: 'Covers the 7 jumps logged here, not all 181.'
		});
	});

	test('singular and thousands', () => {
		expect(loggedScope({ logged: 1, totalJumps: 1200 })?.long).toBe(`Covers the 1 jump logged here, not all ${new Intl.NumberFormat('en-ZA').format(1200)}.`);
		expect(loggedScope({ logged: 1, totalJumps: 2 })?.short).toBe('1 logged jump');
	});
});

test('fmtFreefall', () => {
	expect(fmtFreefall(0)).toBe('0s');
	expect(fmtFreefall(45)).toBe('45s');
	expect(fmtFreefall(275)).toBe('4m 35s');
	expect(fmtFreefall(3 * 3600 + 120)).toBe('3h 02m');
});
