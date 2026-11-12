import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import type { Dropzone } from '../db/schema.ts';
import { checkIn } from '../domain/checkins.ts';
import { addSection, needsSportIndemnity, setIndemnityActive } from '../domain/indemnity.ts';
import { createLoads, openLoadsToday } from '../domain/loads.ts';
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
	});
});
