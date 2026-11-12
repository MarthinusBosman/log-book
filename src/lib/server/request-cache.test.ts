import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from './db/index.ts';
import { cacheableMethod, cached, currentMembership, requestDropzone, requestMemberships } from './request-cache.ts';
import { grantRole } from './domain/permissions.ts';
import { freshDb, makeDropzone, makeUser } from './domain/testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

/** Count statements by wrapping the driver's `select`. */
function counting(base: Database) {
	let selects = 0;
	const db = new Proxy(base, {
		get(t, k, r) {
			if (k === 'select') selects++;
			return Reflect.get(t, k, r);
		}
	}) as Database;
	return { db, count: () => selects };
}

const cookies = (dz?: string) => ({ get: (n: string) => (n === 'dz' ? dz : undefined) });

describe('request cache', () => {
	test('only GET/HEAD requests share reads', () => {
		expect(cacheableMethod('GET')).toBe(true);
		expect(cacheableMethod('HEAD')).toBe(true);
		expect(cacheableMethod('POST')).toBe(false);
	});

	test('memberships + dropzone row are read once per request', async () => {
		const { dz, owner } = await makeDropzone(db);
		const c = counting(db);
		const locals = { db: c.db, cache: new Map() };
		const [a, b] = await Promise.all([requestMemberships(locals, owner.id), requestMemberships(locals, owner.id)]);
		expect(a).toBe(b);
		expect(a[0].roles).toContain('owner');
		await requestDropzone(locals, dz.id);
		const row = await requestDropzone(locals, dz.id);
		expect(row?.id).toBe(dz.id);
		expect(c.count()).toBe(2);
	});

	test('without a cache (form actions) every call reads the database', async () => {
		const { dz, owner } = await makeDropzone(db);
		const c = counting(db);
		const locals = { db: c.db };
		await requestMemberships(locals, owner.id);
		await requestMemberships(locals, owner.id);
		await requestDropzone(locals, dz.id);
		await requestDropzone(locals, dz.id);
		expect(c.count()).toBe(4);
	});

	test('currentMembership follows the dz cookie, else the first membership', async () => {
		const a = await makeDropzone(db);
		const b = await makeDropzone(db);
		const u = await makeUser(db);
		await grantRole(db, { dropzoneId: a.dz.id, userId: u.id, role: 'manifest' });
		await grantRole(db, { dropzoneId: b.dz.id, userId: u.id, role: 'jumper' });
		const locals = { db, cache: new Map() };
		expect((await currentMembership({ locals, cookies: cookies(b.dz.slug) }, u.id))?.dropzone.id).toBe(b.dz.id);
		expect((await currentMembership({ locals, cookies: cookies('not-mine') }, u.id))?.dropzone.id).toBeDefined();
		const none = await makeUser(db);
		expect(await currentMembership({ locals, cookies: cookies() }, none.id)).toBeNull();
	});

	test('a failed read is not cached', async () => {
		const locals = { cache: new Map<string, Promise<unknown>>() };
		let calls = 0;
		const boom = () => {
			calls++;
			return Promise.reject(new Error('boom'));
		};
		await expect(cached(locals, 'k', boom)).rejects.toThrow('boom');
		await expect(cached(locals, 'k', boom)).rejects.toThrow('boom');
		expect(calls).toBe(2);
		expect(await cached(locals, 'k', async () => 7)).toBe(7);
	});
});
