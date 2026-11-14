import { describe, expect, test } from 'bun:test';
import { canonicalRedirect, pathAliasRedirect } from './canonical.ts';

describe('pathAliasRedirect', () => {
	const a = (u: string, method = 'GET') => pathAliasRedirect(new URL(u, 'https://log-book.app'), method);
	test('common auth URL guesses go to the real pages, query kept', () => {
		expect(a('/register')).toBe('/signup');
		expect(a('/sign-up?next=/app/wallet')).toBe('/signup?next=/app/wallet');
		expect(a('/signin')).toBe('/login');
		expect(a('/Sign-In/')).toBe('/login');
		expect(a('/log-in', 'HEAD')).toBe('/login');
	});
	test('real pages, other paths and non-GET are untouched', () => {
		expect(a('/signup')).toBeNull();
		expect(a('/login')).toBeNull();
		expect(a('/register/extra')).toBeNull();
		expect(a('/dz/register')).toBeNull();
		expect(a('/register', 'POST')).toBeNull();
	});
});

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
