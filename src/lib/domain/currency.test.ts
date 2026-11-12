import { describe, expect, test } from 'bun:test';
import { CURRENCIES, currencyForCountry } from './currency.ts';

describe('currencyForCountry', () => {
	test('maps common dropzone countries', () => {
		expect(currencyForCountry('ZA')).toBe('ZAR');
		expect(currencyForCountry('za')).toBe('ZAR');
		expect(currencyForCountry(' us ')).toBe('USD');
		expect(currencyForCountry('DE')).toBe('EUR');
		expect(currencyForCountry('NA')).toBe('NAD');
		expect(currencyForCountry('GB')).toBe('GBP');
	});

	test('unknown or empty countries give null', () => {
		expect(currencyForCountry('')).toBeNull();
		expect(currencyForCountry(null)).toBeNull();
		expect(currencyForCountry('Z')).toBeNull();
		expect(currencyForCountry('QQ')).toBeNull();
	});

	test('every mapped currency is offered in the pickers', () => {
		for (const cc of ['ZA', 'LS', 'NA', 'BW', 'KE', 'US', 'GB', 'AU', 'NZ', 'CA', 'CH', 'NO', 'SE', 'DK', 'BR', 'FR']) {
			expect(CURRENCIES as readonly string[]).toContain(currencyForCountry(cc)!);
		}
	});
});
