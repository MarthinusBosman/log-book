import { describe, expect, test } from 'bun:test';
import { moneyToMinor } from './http.ts';

describe('moneyToMinor (staff tandem deposit / payment amounts)', () => {
	test('comma decimals are not read as thousands', () => {
		expect(moneyToMinor('450,50')).toBe(45050);
		expect(moneyToMinor('1 250.50')).toBe(125050);
		expect(moneyToMinor('R 3 400')).toBe(340000);
		expect(moneyToMinor('1,000')).toBe(100000);
	});
	test('blank is null, junk and negatives are NaN', () => {
		expect(moneyToMinor('')).toBeNull();
		expect(moneyToMinor('  ')).toBeNull();
		expect(moneyToMinor('-50')).toBeNaN();
		expect(moneyToMinor('abc')).toBeNaN();
	});
});
