import { describe, expect, test } from 'bun:test';
import { filterSummary, filtersFromUrl } from './logbook.ts';

const f = (qs: string) => filtersFromUrl(new URL(`https://x.test/app/logbook/print${qs}`));

describe('filterSummary (filtered logbook prints say what they hold)', () => {
	test('null without filters', () => {
		expect(filterSummary(f(''), null)).toBeNull();
		expect(filterSummary(f('?by=year&page=2'), null)).toBeNull();
	});

	test('type, year, dropzone and search in plain words', () => {
		expect(filterSummary(f('?type=angle'))).toBe('Angle jumps');
		expect(filterSummary(f('?type=angle&year=2026&place=dz:abc&q=sunset'), 'Skydive Demo DZ')).toBe('Angle jumps · in 2026 · at Skydive Demo DZ · matching “sunset”');
	});

	test('free-text place and an unknown dropzone', () => {
		expect(filterSummary(f('?place=loc:Pretoria Skydiving Club'))).toBe('at Pretoria Skydiving Club');
		expect(filterSummary(f('?place=dz:gone'))).toBe('at a dropzone');
	});
});
