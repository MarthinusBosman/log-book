import { describe, expect, test } from 'bun:test';
import { dueBadgeText } from './due-badge.ts';

describe('dueBadgeText', () => {
	test('repack / plain dates keep the old wording', () => {
		expect(dueBadgeText({ status: 'unknown', dueOn: null, daysLeft: null }, 'No date')).toEqual({ text: 'No date', sub: null });
		expect(dueBadgeText({ status: 'overdue', dueOn: '2026-11-01', daysLeft: -5 })).toEqual({ text: '5d overdue', sub: '2026-11-01' });
		expect(dueBadgeText({ status: 'due_soon', dueOn: '2026-11-20', daysLeft: 0 })).toEqual({ text: 'Due today', sub: '2026-11-20' });
		expect(dueBadgeText({ status: 'due_soon', dueOn: '2026-11-25', daysLeft: 5 })).toEqual({ text: '5d left', sub: '2026-11-25' });
		expect(dueBadgeText({ status: 'ok', dueOn: '2027-06-01', daysLeft: 200 })).toEqual({ text: '2027-06-01', sub: null });
	});

	test('AAD service cause reads like a service date', () => {
		expect(dueBadgeText({ status: 'overdue', dueOn: '2026-11-01', daysLeft: -5, cause: 'service' })).toEqual({ text: '5d overdue', sub: '2026-11-01' });
	});

	test('AAD end of life says so', () => {
		expect(dueBadgeText({ status: 'overdue', dueOn: '2026-10-01', daysLeft: -45, cause: 'end_of_life' })).toEqual({
			text: 'Past end of life',
			sub: 'End of life 2026-10-01'
		});
		expect(dueBadgeText({ status: 'due_soon', dueOn: '2026-11-20', daysLeft: 0, cause: 'end_of_life' }).text).toBe('Ends today');
		expect(dueBadgeText({ status: 'due_soon', dueOn: '2026-12-01', daysLeft: 11, cause: 'end_of_life' })).toEqual({ text: '11d left', sub: 'End of life 2026-12-01' });
		expect(dueBadgeText({ status: 'ok', dueOn: '2030-01-01', daysLeft: 1200, cause: 'end_of_life' })).toEqual({ text: '2030-01-01', sub: 'End of life' });
	});
});
