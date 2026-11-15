import { describe, expect, test } from 'bun:test';
import { COUNTRY_CODES } from './countries.ts';
import { countryFromTimezone } from './timezone-countries.ts';

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
