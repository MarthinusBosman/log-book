import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { freshDb, makeDropzone, makeMember } from '../domain/testing.ts';
import { createAircraft } from '../domain/dropzone-admin.ts';
import { addSection } from '../domain/indemnity.ts';
import { addBookingSlots } from '../domain/tandems.ts';
import { setupChecklist, setupPending } from './setup.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

const pending = async (dz: Parameters<typeof setupChecklist>[1]) =>
	(await setupChecklist(db, dz)).filter((s) => !s.done).map((s) => s.id);

describe('setup checklist', () => {
	test('a brand-new dropzone has every step open; each ticks off from real data', async () => {
		const { dz } = await makeDropzone(db, {}, {});
		expect(await pending(dz)).toEqual(['profile', 'photo', 'aircraft', 'prices', 'staff', 'waivers', 'booking']);

		await createAircraft(db, dz.id, { name: 'Caravan', capacity: 16, weightLimitKg: 1500 });
		await makeMember(db, dz.id, ['jumper']); // jumpers aren't staff
		expect(await pending(dz)).toContain('staff');
		await makeMember(db, dz.id, ['manifest']);
		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Risk', content: 'Dangerous.' });
		await addBookingSlots(db, { dropzoneId: dz.id, date: '2026-11-14', time: '09:00', capacity: 4 });
		expect(await pending({ ...dz, description: 'Hi', openDays: ['sat'], photoFileId: 'f' })).toEqual(['prices']);
		// the photo is optional: it never keeps the card on screen by itself
		const steps = (await setupChecklist(db, { ...dz, description: 'Hi', openDays: ['sat'] })).map((s) => (s.id === 'prices' ? { ...s, done: true } : s));
		expect(steps.find((s) => s.id === 'photo')!.done).toBe(false);
		expect(setupPending(steps)).toBe(false);
	});

	test('a priced dropzone has the prices step done', async () => {
		const { dz } = await makeDropzone(db);
		expect(await pending(dz)).not.toContain('prices');
	});
});
