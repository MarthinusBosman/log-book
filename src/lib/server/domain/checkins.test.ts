import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { DAY_MS } from './time.ts';
import { checkIn, closeStaleCheckins, currentCheckin, listCheckedIn } from './checkins.ts';
import { NOW, freshDb, makeDropzone, makeUser } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

describe('stale check-ins', () => {
	test('yesterday’s open check-ins close on the next day; today’s stay open', async () => {
		const { dz } = await makeDropzone(db);
		const a = await makeUser(db);
		const b = await makeUser(db);
		await checkIn(db, { dropzoneId: dz.id, userId: a.id, now: NOW - DAY_MS });
		await checkIn(db, { dropzoneId: dz.id, userId: b.id, now: NOW });
		expect(await closeStaleCheckins(db, {}, NOW)).toBe(0); // needs a scope
		expect(await closeStaleCheckins(db, { userId: b.id }, NOW)).toBe(0);
		expect(await closeStaleCheckins(db, { dropzoneId: dz.id }, NOW)).toBe(1);
		expect((await listCheckedIn(db, dz.id)).map((r) => r.user.id)).toEqual([b.id]);
		expect(await currentCheckin(db, a.id)).toBeUndefined();
		// 150 stale rows still close (chunked under D1's bound-parameter limit)
		const many = await Promise.all(Array.from({ length: 150 }, () => makeUser(db)));
		for (const u of many) await checkIn(db, { dropzoneId: dz.id, userId: u.id, now: NOW - 2 * DAY_MS });
		expect(await closeStaleCheckins(db, { dropzoneId: dz.id }, NOW)).toBe(150);
	});
});
