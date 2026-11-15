import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from './db/index.ts';
import { cacheableMethod, cached, currentMembership, requestDropzone, requestMemberships } from './request-cache.ts';
import { grantRole } from './domain/permissions.ts';
import { checkIn } from './domain/checkins.ts';
import { pickMembership, type Membership } from './dropzones/index.ts';
import { NOW, freshDb, makeDropzone, makeUser } from './domain/testing.ts';

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

	test('without a dz cookie: checked-in dropzone first, else the strongest role', async () => {
		const a = await makeDropzone(db, { name: 'Alpha Club' });
		const b = await makeDropzone(db, { name: 'Zulu Skydive' });
		const u = await makeUser(db);
		await grantRole(db, { dropzoneId: a.dz.id, userId: u.id, role: 'jumper' });
		await grantRole(db, { dropzoneId: b.dz.id, userId: u.id, role: 'manifest' });
		const current = (dz?: string) => currentMembership({ locals: { db, cache: new Map() }, cookies: cookies(dz) }, u.id);
		// manifest at Zulu outranks jumper at Alpha, though Alpha sorts first
		expect((await current())?.dropzone.id).toBe(b.dz.id);
		expect((await current('stale-slug'))?.dropzone.id).toBe(b.dz.id);
		// checked in at Alpha today: that's where they are
		await checkIn(db, { dropzoneId: a.dz.id, userId: u.id, now: NOW });
		expect((await current())?.dropzone.id).toBe(a.dz.id);
		// an explicit choice still wins
		expect((await current(b.dz.slug))?.dropzone.id).toBe(b.dz.id);
		// the check-in read only happens without a matching cookie
		const c = counting(db);
		await currentMembership({ locals: { db: c.db, cache: new Map() }, cookies: cookies(b.dz.slug) }, u.id);
		expect(c.count()).toBe(1);
		const d = counting(db);
		await currentMembership({ locals: { db: d.db, cache: new Map() }, cookies: cookies() }, u.id);
		expect(d.count()).toBe(2);
	});

	test('pickMembership: cookie, then check-in, then role precedence, then name order', () => {
		const m = (id: string, role: Membership['role']): Membership => ({ dropzone: { id, slug: id, name: id, country: null }, roles: [role], role });
		const list = [m('a', 'jumper'), m('b', 'owner'), m('c', 'jumper')];
		expect(pickMembership(list, 'c')?.dropzone.id).toBe('c');
		expect(pickMembership(list, undefined, 'a')?.dropzone.id).toBe('a');
		expect(pickMembership(list, 'gone', 'gone')?.dropzone.id).toBe('b');
		expect(pickMembership([m('a', 'jumper'), m('c', 'jumper')], null)?.dropzone.id).toBe('a');
		expect(pickMembership([], 'a')).toBeNull();
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
