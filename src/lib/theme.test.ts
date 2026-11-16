import { describe, expect, test } from 'bun:test';
import { nextTheme, parseTheme } from './theme.ts';

describe('nextTheme (POST /theme, the no-JS switch)', () => {
	test('flips the cookie when the page sent nothing (marketing switch)', () => {
		expect(nextTheme(undefined)).toBe('light'); // default dark → light
		expect(nextTheme('dark')).toBe('light');
		expect(nextTheme('light')).toBe('dark');
		expect(nextTheme('bogus')).toBe('light');
	});

	test('flips what the page showed when the app toggle sends it (dropzone default without a cookie)', () => {
		expect(nextTheme(undefined, 'light')).toBe('dark');
		expect(nextTheme('dark', 'light')).toBe('dark');
		expect(nextTheme('light', 'dark')).toBe('light');
	});

	test('ignores an invalid current value', () => {
		expect(nextTheme('light', 'system')).toBe('dark');
		expect(nextTheme(undefined, '')).toBe('light');
		expect(parseTheme(null)).toBe('dark');
	});
});
