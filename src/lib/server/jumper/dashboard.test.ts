import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import type { Dropzone } from '../db/schema.ts';
import { checkIn } from '../domain/checkins.ts';
import { addSection, needsSportIndemnity, setIndemnityActive, signIndemnity, WAIVER_VALID_DAYS } from '../domain/indemnity.ts';
import { DAY_MS } from '../domain/time.ts';
import { boardLoad, createLoads, openLoadsToday } from '../domain/loads.ts';
import { DAY, NOW, freshDb, makeDropzone, makeUser } from '../domain/testing.ts';
import { loadJumperDashboard } from './dashboard.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

describe('dropzone row reuse (fewer D1 round trips)', () => {
	test('openLoadsToday and needsSportIndemnity accept an already-loaded row', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4, open: true });
		const byId = await openLoadsToday(db, dz.id, NOW);
		expect(byId).toHaveLength(1);
		expect((await openLoadsToday(db, dz, NOW)).map((l) => l.id)).toEqual(byId.map((l) => l.id));

		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Risk', content: 'Sport.' });
		await setIndemnityActive(db, dz.id, 'sport', true);
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(true);
		expect(await needsSportIndemnity(db, { id: dz.id, indemnitySportActive: true }, u.id)).toBe(true);
		// The caller's row is trusted (it was read in the same request).
		expect(await needsSportIndemnity(db, { id: dz.id, indemnitySportActive: false }, u.id)).toBe(false);
	});

	test('needsSportIndemnity is one statement and only counts this user’s sport signature here', async () => {
		const { dz } = await makeDropzone(db);
		const { dz: other } = await makeDropzone(db, { slug: 'other-dz', name: 'Other DZ' });
		const u = await makeUser(db);
		const someone = await makeUser(db);
		let selects = 0;
		const counted = new Proxy(db, {
			get(t, k, r) {
				if (k === 'select') selects++;
				return Reflect.get(t, k, r);
			}
		}) as Database;
		const row = { id: dz.id, indemnitySportActive: true };
		// active but no sections: nothing to sign
		expect(await needsSportIndemnity(counted, row, u.id)).toBe(false);
		expect(selects).toBe(1);

		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Risk', content: 'Sport.' });
		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'More', content: 'Sport.' });
		await addSection(db, { dropzoneId: other.id, audience: 'sport', title: 'Risk', content: 'Sport.' });
		// signatures that don't count: another jumper's, this jumper's at another dropzone
		await signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: someone.id, signerName: 'S' });
		await signIndemnity(db, { dropzoneId: other.id, audience: 'sport', userId: u.id, signerName: 'U' });
		selects = 0;
		expect(await needsSportIndemnity(counted, row, u.id)).toBe(true);
		expect(selects).toBe(1);
		// expired, then fresh
		await signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: u.id, signerName: 'U', now: Date.now() - (WAIVER_VALID_DAYS + 1) * DAY_MS });
		expect(await needsSportIndemnity(db, row, u.id)).toBe(true);
		await signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: u.id, signerName: 'U' });
		expect(await needsSportIndemnity(db, row, u.id)).toBe(false);
		expect(await needsSportIndemnity(db, { id: other.id, indemnitySportActive: true }, someone.id)).toBe(true);
	});

	test('loadJumperDashboard resolves each dropzone once through the given getter', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4, open: true });
		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Risk', content: 'Sport.' });
		await setIndemnityActive(db, dz.id, 'sport', true);
		await checkIn(db, { dropzoneId: dz.id, userId: u.id, now: NOW });

		const fresh = (await db.query.dropzones.findFirst({ where: (d, { eq }) => eq(d.id, dz.id) })) as Dropzone;
		const asked: string[] = [];
		const viaGetter = await loadJumperDashboard(db, u.id, dz.id, NOW, async (id) => {
			asked.push(id);
			return fresh;
		});
		expect(asked).toEqual([dz.id]); // current + checked-in DZ are the same: one lookup
		const plain = await loadJumperDashboard(db, u.id, dz.id, NOW);
		expect(viaGetter).toEqual(plain);
		expect(plain.joinableLoads).toBe(1);
		expect(plain.alerts.some((a) => a.id === 'waiver')).toBe(true);

		// A boarding load is listed but can't be joined from the phone any more.
		const [only] = await openLoadsToday(db, dz, NOW);
		await boardLoad(db, only.id, { now: NOW });
		expect((await loadJumperDashboard(db, u.id, dz.id, NOW)).joinableLoads).toBe(0);
	});
});
