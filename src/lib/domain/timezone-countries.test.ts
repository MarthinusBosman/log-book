import { describe, expect, test } from 'bun:test';
import { COUNTRY_CODES } from './countries.ts';
import { countryFromTimezone, suggestTimezone } from './timezone-countries.ts';

describe('countryFromTimezone', () => {
	test('maps zones (and old alias names browsers report) to their country', () => {
		expect(countryFromTimezone('Africa/Johannesburg')).toBe('ZA');
		expect(countryFromTimezone('Africa/Windhoek')).toBe('NA');
		expect(countryFromTimezone('America/Chicago')).toBe('US');
		expect(countryFromTimezone('Europe/London')).toBe('GB');
		expect(countryFromTimezone('Asia/Calcutta')).toBe('IN');
		expect(countryFromTimezone('Asia/Kolkata')).toBe('IN');
		expect(countryFromTimezone('Europe/Kiev')).toBe('UA');
	});

	test('has no country for UTC, Etc zones or junk', () => {
		for (const z of ['UTC', 'Etc/GMT+2', 'Mars/Olympus', '', null, undefined]) expect(countryFromTimezone(z)).toBeNull();
	});

	test('covers every zone the runtime knows, always with a real country code', () => {
		const known = new Set(COUNTRY_CODES);
		const zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
		const missing = zones.filter((z) => !z.startsWith('Etc/') && z !== 'UTC' && !countryFromTimezone(z));
		expect(missing).toEqual([]);
		for (const z of zones) {
			const cc = countryFromTimezone(z);
			if (cc) expect(known.has(cc)).toBe(true);
		}
	});
});

describe('suggestTimezone', () => {
	const known = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');

	test('keeps a zone that already belongs to the chosen country', () => {
		expect(suggestTimezone('ZA', 'Africa/Johannesburg', known)).toBeNull();
		expect(suggestTimezone('US', 'America/Denver', known)).toBeNull();
		expect(suggestTimezone('', 'Africa/Johannesburg', known)).toBeNull();
	});

	test("moves to the country's zone, its main one when it has several", () => {
		expect(suggestTimezone('NA', 'Africa/Johannesburg', known)).toEqual({ zone: 'Africa/Windhoek', several: false });
		expect(suggestTimezone('ZA', 'UTC', known)).toEqual({ zone: 'Africa/Johannesburg', several: false });
		expect(suggestTimezone('US', 'Africa/Johannesburg', known)).toEqual({ zone: 'America/New_York', several: true });
		expect(suggestTimezone('AU', 'Europe/London', known)).toEqual({ zone: 'Australia/Sydney', several: true });
	});

	test('only suggests zones the picker offers', () => {
		expect(suggestTimezone('UA', 'UTC', ['UTC', 'Europe/Kiev'])).toEqual({ zone: 'Europe/Kiev', several: false });
		expect(suggestTimezone('ZA', 'UTC', ['UTC'])).toBeNull();
	});

	test("every country with a zone gets a known suggestion of its own", () => {
		for (const cc of new Set(known.map(countryFromTimezone).filter(Boolean) as string[])) {
			const s = suggestTimezone(cc, 'UTC', known);
			expect(s && countryFromTimezone(s.zone)).toBe(cc);
			expect(known).toContain(s!.zone);
		}
	});
});
