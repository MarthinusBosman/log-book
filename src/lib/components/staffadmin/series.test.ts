import { describe, expect, test } from 'bun:test';
import { bucketFor, bucketKey, timeSeries } from './series.ts';

describe('report series', () => {
	test('bucket size follows range length', () => {
		expect(bucketFor('2026-01-01', '2026-01-31')).toBe('day');
		expect(bucketFor('2026-01-01', '2026-05-01')).toBe('week');
		expect(bucketFor('2026-01-01', '2026-12-31')).toBe('month');
	});
	test('weeks start on Monday', () => {
		expect(bucketKey('2026-11-11', 'week')).toBe('2026-11-09');
		expect(bucketKey('2026-11-09', 'week')).toBe('2026-11-09');
		expect(bucketKey('2026-11-15', 'week')).toBe('2026-11-09');
	});
	test('fills gaps and sums per bucket', () => {
		const s = timeSeries(
			[
				{ day: '2026-11-02', n: 3 },
				{ day: '2026-11-02', n: 1 },
				{ day: '2026-11-04', n: 5 },
				{ day: '2026-12-01', n: 9 }
			],
			'2026-11-01',
			'2026-11-05',
			(r) => [r.n],
			1
		);
		expect(s.bucket).toBe('day');
		expect(s.points.map((p) => p.values[0])).toEqual([0, 4, 0, 5, 0]);
		expect(s.points[1].label).toBe('2 Nov');
	});
});
