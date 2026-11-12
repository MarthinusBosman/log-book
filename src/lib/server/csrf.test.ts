import { describe, expect, test } from 'bun:test';
import { isCsrfForbidden } from './csrf.ts';

const self = 'https://log-book.app';
const base = { method: 'POST', contentType: 'application/x-www-form-urlencoded', origin: self, selfOrigin: self, pathname: '/app/settings?/save' };

describe('csrf guard', () => {
	test('same-origin form posts pass; cross-site and Origin-less ones are blocked', () => {
		expect(isCsrfForbidden(base)).toBe(false);
		expect(isCsrfForbidden({ ...base, origin: 'https://evil.example' })).toBe(true);
		expect(isCsrfForbidden({ ...base, origin: null })).toBe(true);
		expect(isCsrfForbidden({ ...base, contentType: 'multipart/form-data; boundary=x', origin: null })).toBe(true);
		expect(isCsrfForbidden({ ...base, contentType: 'text/plain;charset=UTF-8', origin: 'https://evil.example' })).toBe(true);
		expect(isCsrfForbidden({ ...base, contentType: null, origin: null })).toBe(true);
	});

	test('JSON APIs and safe methods are unaffected (same as SvelteKit)', () => {
		expect(isCsrfForbidden({ ...base, contentType: 'application/json', origin: null })).toBe(false);
		expect(isCsrfForbidden({ ...base, method: 'GET', origin: null })).toBe(false);
	});

	test('payment webhooks accept Origin-less form posts (they verify signatures instead)', () => {
		expect(isCsrfForbidden({ ...base, origin: null, pathname: '/api/payments/payfast/dz-1' })).toBe(false);
		expect(isCsrfForbidden({ ...base, origin: null, pathname: '/api/paymentsX' })).toBe(true);
	});
});
