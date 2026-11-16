import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { requestDropzone, requestMemberships } from '../request-cache.ts';
import { dropzoneOptions } from './logbook.ts';
import { NOW, freshDb, makeDropzone, makeUser } from '../domain/testing.ts';
import { todayAt } from './forms.ts';
import { gearContext } from './gear.ts';

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

describe('jumper page helpers reuse the request-cached dropzone row', () => {
	test("todayAt uses the dropzone's timezone and costs no query once the layout read the row", async () => {
		const { dz } = await makeDropzone(db, { timezone: 'Pacific/Kiritimati' });
		const c = counting(db);
		const locals = { db: c.db, cache: new Map() };
		await requestDropzone(locals, dz.id); // what the /app layout does
		const before = c.count();
		// 2026-11-14T08:00Z is already the 14th everywhere; 23:30Z on the 14th is the 15th in UTC+14.
		expect(await todayAt(locals, dz.id, NOW)).toBe('2026-11-14');
		expect(await todayAt(locals, dz.id, Date.parse('2026-11-14T23:30:00Z'))).toBe('2026-11-15');
		expect(await todayAt(locals, null, Date.parse('2026-11-14T23:30:00Z'))).toBe('2026-11-14');
		expect(c.count()).toBe(before);
	});

	test('todayAt without a cache (form actions) still reads the dropzone', async () => {
		const { dz } = await makeDropzone(db, { timezone: 'Pacific/Kiritimati' });
		expect(await todayAt({ db }, dz.id, Date.parse('2026-11-14T23:30:00Z'))).toBe('2026-11-15');
	});

	test('gearContext takes repack interval and warn days from the cached row; only the weight is read', async () => {
		const { dz } = await makeDropzone(db, { repackIntervalDays: 120, settings: { gearWarnDays: 14 } });
		const u = await makeUser(db, { loadingWeightKg: 92 });
		const c = counting(db);
		const locals = { db: c.db, cache: new Map() };
		await requestDropzone(locals, dz.id);
		const before = c.count();
		const ctx = await gearContext(locals, u.id, dz.id);
		expect(c.count() - before).toBe(1);
		expect(ctx).toMatchObject({ intervalDays: 120, intervalSource: dz.name, warnDays: 14, exitWeightKg: 92 });
		const none = await gearContext({ db }, u.id, null);
		expect(none.intervalSource).toBeNull();
		expect(none.warnDays).toBe(30);
	});

	test('dropzoneOptions reuses the cached memberships', async () => {
		const { dz, owner } = await makeDropzone(db);
		const c = counting(db);
		const locals = { db: c.db, cache: new Map() };
		await requestMemberships(locals, owner.id); // what the /app layout does
		const before = c.count();
		expect(await dropzoneOptions(locals, owner.id)).toEqual([{ id: dz.id, name: dz.name }]);
		const cachedReads = c.count() - before;
		const start = c.count();
		await dropzoneOptions({ db: c.db }, owner.id); // no cache: memberships read again
		expect(c.count() - start - cachedReads).toBe(1);
	});
});
