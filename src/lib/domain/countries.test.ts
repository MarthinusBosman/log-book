import { describe, expect, test } from 'bun:test';
import { COUNTRY_CODES, countryFromLanguage, countryName, countryOptions, normalizeCountry } from './countries.ts';

describe('countries', () => {
	test('holds every ISO 3166-1 alpha-2 code once (plus Kosovo)', () => {
		expect(COUNTRY_CODES).toHaveLength(250);
		expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
		for (const c of COUNTRY_CODES) expect(c).toMatch(/^[A-Z]{2}$/);
		for (const c of ['ZA', 'NA', 'BW', 'GB', 'US', 'XK']) expect(COUNTRY_CODES).toContain(c);
	});

	test('normalizeCountry accepts real codes and common aliases only', () => {
		expect(normalizeCountry(' za ')).toBe('ZA');
		expect(normalizeCountry('uk')).toBe('GB');
		expect(normalizeCountry('EL')).toBe('GR');
		expect(normalizeCountry('QQ')).toBeNull();
		expect(normalizeCountry('RSA')).toBeNull();
		expect(normalizeCountry('')).toBeNull();
		expect(normalizeCountry(null)).toBeNull();
	});

	test('names and options read like countries, sorted by name', () => {
		expect(countryName('ZA')).toBe('South Africa');
		expect(countryName('SA')).toBe('Saudi Arabia');
		const opts = countryOptions();
		expect(opts).toHaveLength(250);
		expect(opts.find((o) => o.value === 'NA')?.label).toBe('Namibia');
		const labels = opts.map((o) => o.label);
		expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en')));
		// An old stored value outside the list stays selectable.
		expect(countryOptions('QQ').some((o) => o.value === 'QQ')).toBe(true);
		expect(countryOptions('ZA')).toHaveLength(250);
	});

	test('countryFromLanguage reads the region of a browser language tag', () => {
		expect(countryFromLanguage('en-ZA')).toBe('ZA');
		expect(countryFromLanguage('af-za')).toBe('ZA');
		expect(countryFromLanguage('en-GB')).toBe('GB');
		expect(countryFromLanguage('zh-Hant-TW')).toBe('TW');
		expect(countryFromLanguage('en')).toBeNull();
		expect(countryFromLanguage('es-419')).toBeNull();
		expect(countryFromLanguage(undefined)).toBeNull();
	});
});
