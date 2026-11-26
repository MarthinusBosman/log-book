import { describe, expect, test } from 'bun:test';
import { aadDueText, countdown, exportQuery, fmtFreefall, groupByDay, joinableCount, loggedScope, relativeTime, walletShortfall } from './format.ts';

test('relativeTime prints older instants on the given timezone calendar', () => {
	const now = Date.parse('2026-11-18T10:00:00Z');
	const at = Date.parse('2026-11-02T23:30:00Z');
	expect(relativeTime(at, now, 'Africa/Johannesburg')).toBe('3 Nov');
	expect(relativeTime(at, now, 'America/New_York')).toBe('2 Nov');
	expect(relativeTime(at, now, 'UTC')).toBe('2 Nov');
	expect(relativeTime(at, now, 'Not/AZone')).toMatch(/^[23] Nov$/);
	expect(relativeTime(now - 3 * 60_000, now, 'UTC')).toBe('3 min ago');
});

test('groupByDay splits newest-first items by calendar day in the timezone', () => {
	const now = Date.parse('2026-11-20T10:00:00Z');
	const at = (iso: string) => ({ createdAt: Date.parse(iso) });
	const items = [at('2026-11-20T09:00:00Z'), at('2026-11-19T22:30:00Z'), at('2026-11-19T08:00:00Z'), at('2026-11-17T12:00:00Z'), at('2025-12-31T12:00:00Z')];
	const jhb = groupByDay(items, now, 'Africa/Johannesburg');
	// 22:30Z on the 19th is already the 20th in Johannesburg.
	expect(jhb.map((g) => [g.label, g.items.length])).toEqual([
		['Today', 2],
		['Yesterday', 1],
		['Tue 17 Nov', 1],
		['Wed 31 Dec 2025', 1]
	]);
	expect(groupByDay(items, now, 'UTC').map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Tue 17 Nov', 'Wed 31 Dec 2025']);
	expect(groupByDay(items, now, 'UTC')[1].items.length).toBe(2);
	expect(groupByDay([], now, 'UTC')).toEqual([]);
	// Yesterday across a month boundary.
	expect(groupByDay([at('2026-11-30T12:00:00Z')], Date.parse('2026-12-01T08:00:00Z'), 'UTC')[0].label).toBe('Yesterday');
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

describe('countdown', () => {
	test('carries units so it never reads as a clock time', () => {
		const now = 1_000_000;
		expect(countdown(now + (11 * 60 + 29) * 1000, now)).toBe('11m 29s');
		expect(countdown(now + (5 * 60 + 4) * 1000 + 500, now)).toBe('5m 04s');
		expect(countdown(now + 45_000, now)).toBe('45s');
		expect(countdown(now + (65 * 60) * 1000, now)).toBe('1h 05m');
		expect(countdown(now, now)).toBeNull();
		expect(countdown(now - 1000, now)).toBeNull();
	});
});

describe('joinableCount', () => {
	test('counts loads the jumper can still join, like the dashboard', () => {
		const ss = ['planned', 'open', 'called'];
		const loads = [
			{ status: 'boarding', full: false, mine: null },
			{ status: 'called', full: false, mine: null },
			{ status: 'open', full: true, mine: null },
			{ status: 'open', full: false, mine: { slotId: 's' } },
			{ status: 'open', full: false, mine: null }
		];
		expect(joinableCount(loads, ss)).toBe(2);
		expect(joinableCount([], ss)).toBe(0);
	});
});

test('aadDueText names end of life when that date drives the AAD status', () => {
	expect(aadDueText({ status: 'overdue', daysLeft: -3, dueOn: '2026-11-11', cause: 'end_of_life' })).toEqual({ badge: 'Past end of life', sub: 'End of life 11 Nov 2026' });
	expect(aadDueText({ status: 'due_soon', daysLeft: 12, dueOn: '2026-11-26', cause: 'end_of_life' }).badge).toBe('Ends in 12 days');
	expect(aadDueText({ status: 'due_soon', daysLeft: 0, dueOn: '2026-11-14', cause: 'end_of_life' }).badge).toBe('Ends today');
	expect(aadDueText({ status: 'overdue', daysLeft: -3, dueOn: '2026-11-11', cause: 'service' })).toEqual({ badge: 'Overdue by 3 days', sub: 'Service due 11 Nov 2026' });
	expect(aadDueText({ status: 'ok', daysLeft: 200, dueOn: '2027-06-02', cause: 'service' }).badge).toBe('OK · 200 days');
	expect(aadDueText({ status: 'unknown', daysLeft: null, dueOn: null, cause: null })).toEqual({ badge: 'Not set', sub: 'No dates set' });
});
