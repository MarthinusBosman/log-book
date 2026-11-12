import { describe, expect, test } from 'bun:test';
import { PRICE_CODES } from '#lib/domain/constants.ts';
import { PRICE_GROUPS } from './pricelistGroups.ts';
import { currencySymbol, minorToInput, parseMoney } from './money.ts';
import { settingsTabs, visibleSettingsTabs } from './settingsTabs.ts';

describe('parseMoney', () => {
	test('accepts common formats', () => {
		expect(parseMoney('450')).toBe(45000);
		expect(parseMoney('450.5')).toBe(45050);
		expect(parseMoney('1 250.00')).toBe(125000);
		expect(parseMoney('1,250.75')).toBe(125075);
		expect(parseMoney('12,50')).toBe(1250);
		expect(parseMoney('0')).toBe(0);
		expect(parseMoney('-20', { allowNegative: true })).toBe(-2000);
	});
	test('rejects junk, negatives and >2 decimals', () => {
		expect(parseMoney('')).toBeNull();
		expect(parseMoney('abc')).toBeNull();
		expect(parseMoney('1.234')).toBeNull();
		expect(parseMoney('-5')).toBeNull();
		expect(parseMoney('1e5')).toBeNull();
	});
	test('round-trips and symbols', () => {
		expect(minorToInput(45050)).toBe('450.50');
		expect(currencySymbol('ZAR')).toBe('R');
		expect(currencySymbol('USD')).toBe('$');
		expect(currencySymbol('XXX1')).toBe('XXX1');
	});
});

test('price groups cover every price code exactly once', () => {
	const codes = PRICE_GROUPS.flatMap((g) => g.codes.map((c) => c.code));
	expect(codes.length).toBe(new Set(codes).size);
	expect([...codes].sort()).toEqual([...PRICE_CODES].sort());
});

test('settings tabs are filtered by capability', () => {
	expect(visibleSettingsTabs(['dz.settings', 'staff.manage'])).toHaveLength(settingsTabs.length);
	expect(visibleSettingsTabs(['staff.manage']).map((t) => t.slug)).toEqual(['members', 'linked-accounts']);
	// Personal tabs are visible to everyone, even without a dropzone.
	expect(visibleSettingsTabs([]).map((t) => t.slug)).toEqual(['linked-accounts']);
});
