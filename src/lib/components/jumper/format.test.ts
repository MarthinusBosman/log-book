import { describe, expect, test } from 'bun:test';
import { exportQuery, fmtFreefall, loggedScope, relativeTime, walletShortfall } from './format.ts';

test('relativeTime prints older instants on the given timezone calendar', () => {
	const now = Date.parse('2026-11-18T10:00:00Z');
	const at = Date.parse('2026-11-02T23:30:00Z');
	expect(relativeTime(at, now, 'Africa/Johannesburg')).toBe('3 Nov');
	expect(relativeTime(at, now, 'America/New_York')).toBe('2 Nov');
	expect(relativeTime(at, now, 'UTC')).toBe('2 Nov');
	expect(relativeTime(at, now, 'Not/AZone')).toMatch(/^[23] Nov$/);
	expect(relativeTime(now - 3 * 60_000, now, 'UTC')).toBe('3 min ago');
});

test('exportQuery keeps the logbook filters, drops page and breakdown tab', () => {
	expect(exportQuery('?q=sunset&type=fun&by=dz&page=3&year=2025')).toBe('q=sunset&type=fun&year=2025');
	expect(exportQuery('?by=year')).toBe('');
});

describe('walletShortfall', () => {
	const w = { availableMinor: 10_000, currency: 'ZAR' };
	test('enough money or no wallet: nothing to say', () => {
		expect(walletShortfall(w, 10_000)).toEqual({ short: false, overdraw: false });
		expect(walletShortfall(null, 99_999)).toEqual({ short: false, overdraw: false });
		expect(walletShortfall(w, -5_000)).toEqual({ short: false, overdraw: false });
	});

	test('short when the slot costs more than is available', () => {
		expect(walletShortfall(w, 10_001)).toEqual({ short: true, overdraw: false });
		expect(walletShortfall({ ...w, availableMinor: 0 }, 45_000)).toEqual({ short: true, overdraw: false });
	});

	test('a DZ that allows a negative balance is never short, only overdrawn', () => {
		expect(walletShortfall({ ...w, allowNegative: true }, 45_000)).toEqual({ short: false, overdraw: true });
		expect(walletShortfall({ ...w, allowNegative: true }, 5_000)).toEqual({ short: false, overdraw: false });
	});
});

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
