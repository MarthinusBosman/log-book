import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import type { Dropzone } from '../db/schema.ts';
import { checkIn } from '../domain/checkins.ts';
import { addSection, needsSportIndemnity, setIndemnityActive, signIndemnity, WAIVER_VALID_DAYS } from '../domain/indemnity.ts';
import { DAY_MS } from '../domain/time.ts';
import { boardLoad, cancelLoad, createLoads, dropzonesWithLoadsOnDay, hasLoadsOnDay, openLoadsToday } from '../domain/loads.ts';
import { openToday } from '../../components/jumper/hours.ts';
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

describe('loads on today’s board beat the opening days', () => {
	test('hasLoadsOnDay / dropzonesWithLoadsOnDay ignore cancelled loads and other days', async () => {
		const { dz, owner } = await makeDropzone(db);
		const { dz: quiet } = await makeDropzone(db, { slug: 'quiet-dz', name: 'Quiet DZ' });
		const { dz: cancelled } = await makeDropzone(db, { slug: 'cancelled-dz', name: 'Cancelled DZ' });
		await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4, createdBy: owner.id, now: NOW });
		await createLoads(db, { dropzoneId: quiet.id, day: '2026-11-15', capacity: 4, createdBy: owner.id, now: NOW });
		const [c] = await createLoads(db, { dropzoneId: cancelled.id, day: DAY, capacity: 4, createdBy: owner.id, now: NOW });
		await cancelLoad(db, c.id, { now: NOW });

		expect(await hasLoadsOnDay(db, dz.id, DAY)).toBe(true);
		expect(await hasLoadsOnDay(db, quiet.id, DAY)).toBe(false);
		expect(await hasLoadsOnDay(db, quiet.id, '2026-11-15')).toBe(true);
		expect(await hasLoadsOnDay(db, cancelled.id, DAY)).toBe(false);

		const flying = await dropzonesWithLoadsOnDay(db, [
			{ id: dz.id, day: DAY },
			// a load on the 15th must not count for a DZ whose "today" is the 14th
			{ id: quiet.id, day: DAY },
			{ id: cancelled.id, day: DAY }
		]);
		expect([...flying]).toEqual([dz.id]);
		expect((await dropzonesWithLoadsOnDay(db, [])).size).toBe(0);
	});

	test('dashboard reports loadsToday for the selected dropzone; the badge says loads are running', async () => {
		// 2026-11-14 is a Saturday: the DZ only opens on Sundays
		const { dz, owner } = await makeDropzone(db, { openDays: ['sun'], openTime: '08:00', closeTime: '17:00' });
		const u = await makeUser(db);
		const hours = { openDays: ['sun'], openTime: '08:00', closeTime: '17:00', timezone: dz.timezone };
		const before = await loadJumperDashboard(db, u.id, dz.id, NOW);
		expect(before.loadsToday).toBe(false);
		expect(openToday(hours, NOW, before.loadsToday)?.label).toBe('Closed today');

		await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4, createdBy: owner.id, now: NOW });
		const after = await loadJumperDashboard(db, u.id, dz.id, NOW);
		expect(after.loadsToday).toBe(true);
		expect(openToday(hours, NOW, after.loadsToday)).toEqual({ label: 'Loads running today', tone: 'success' });
		// without a selected dropzone there's nothing to say
		expect((await loadJumperDashboard(db, u.id, null, NOW)).loadsToday).toBe(false);
	});
});
