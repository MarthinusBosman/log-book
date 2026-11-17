import { describe, expect, test } from 'bun:test';
import { radioKeyTarget, radioTabIndex } from './radio-keys.ts';

describe('radioTabIndex', () => {
	test('checked option holds the tab stop', () => {
		expect(radioTabIndex([true, true, true], 2)).toBe(2);
	});
	test('nothing checked → first enabled option', () => {
		expect(radioTabIndex([false, true, true], -1)).toBe(1);
	});
	test('checked but disabled (slot filled up) → first enabled option', () => {
		expect(radioTabIndex([true, false, true], 1)).toBe(0);
	});
	test('all disabled → -1', () => {
		expect(radioTabIndex([false, false], -1)).toBe(-1);
	});
});

describe('radioKeyTarget', () => {
	const all = [true, true, true];
	test('arrows move forward/back and wrap', () => {
		expect(radioKeyTarget(all, 0, 'ArrowRight')).toBe(1);
		expect(radioKeyTarget(all, 0, 'ArrowDown')).toBe(1);
		expect(radioKeyTarget(all, 2, 'ArrowRight')).toBe(0);
		expect(radioKeyTarget(all, 0, 'ArrowLeft')).toBe(2);
		expect(radioKeyTarget(all, 1, 'ArrowUp')).toBe(0);
	});
	test('full (disabled) options are skipped', () => {
		expect(radioKeyTarget([true, false, true], 0, 'ArrowRight')).toBe(2);
		expect(radioKeyTarget([true, false, true], 0, 'ArrowLeft')).toBe(2);
	});
	test('Home/End go to the first/last enabled option', () => {
		expect(radioKeyTarget([false, true, true, false], 2, 'Home')).toBe(1);
		expect(radioKeyTarget([false, true, true, false], 1, 'End')).toBe(2);
	});
	test('only one enabled option or unrelated keys → null', () => {
		expect(radioKeyTarget([true, false], 0, 'ArrowRight')).toBeNull();
		expect(radioKeyTarget(all, 0, 'Enter')).toBeNull();
		expect(radioKeyTarget([false, false], 0, 'ArrowRight')).toBeNull();
	});
});
