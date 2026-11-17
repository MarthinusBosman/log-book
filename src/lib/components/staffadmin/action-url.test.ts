import { describe, expect, test } from 'bun:test';
import { followsActionUrl } from './action-url.ts';

describe('followsActionUrl', () => {
	const here = new URL('http://localhost/app/gear?q=Student&service=abc');

	test('same-page actions stay on the current URL (no scroll/focus reset)', () => {
		expect(followsActionUrl(new URL('http://localhost/app/gear?/service'), here)).toBe(false);
		expect(followsActionUrl(new URL('http://localhost/app/gear'), here)).toBe(false);
	});

	test('an action on another route keeps Kit’s navigation', () => {
		expect(followsActionUrl(new URL('http://localhost/app/jumpers/u1?/topUp'), here)).toBe(true);
	});
});
