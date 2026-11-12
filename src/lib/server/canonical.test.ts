import { describe, expect, test } from 'bun:test';
import { canonicalRedirect } from './canonical.ts';

const r = (u: string, method = 'GET', host: string | undefined = 'log-book.app') => canonicalRedirect(new URL(u), method, host);
const unset = (u: string) => canonicalRedirect(new URL(u), 'GET', undefined);

describe('canonicalRedirect', () => {
	test('unset = never redirects', () => {
		expect(r('https://log-book.io/app', 'GET', '')).toBeNull();
		expect(unset('https://log-book.io/app')).toBeNull();
	});
	test('other TLD and www aliases go to the canonical host, same path + query', () => {
		expect(r('https://log-book.io/dz/skydive?x=1')).toEqual({ status: 301, location: 'https://log-book.app/dz/skydive?x=1' });
		expect(r('http://www.log-book.io/')).toEqual({ status: 301, location: 'https://log-book.app/' });
		expect(r('https://www.log-book.app/features')).toEqual({ status: 301, location: 'https://log-book.app/features' });
	});
	test('non-GET uses 308 so the body is kept', () => {
		expect(r('https://log-book.io/api/x', 'POST')?.status).toBe(308);
	});
	test('canonical host and unrelated hosts are untouched', () => {
		expect(r('https://log-book.app/app')).toBeNull();
		expect(r('http://localhost:4317/app')).toBeNull();
		expect(r('https://dzapp-preview.someone.workers.dev/')).toBeNull();
		expect(r('https://skydive.example.com/')).toBeNull();
	});
	test('tolerates a scheme or path in the env value', () => {
		expect(r('https://log-book.io/a', 'GET', 'https://log-book.app/')?.location).toBe('https://log-book.app/a');
	});
});
