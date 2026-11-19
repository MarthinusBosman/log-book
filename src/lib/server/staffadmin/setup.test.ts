import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { NOW, freshDb, makeDropzone, makeMember } from '../domain/testing.ts';
import { createAircraft } from '../domain/dropzone-admin.ts';
import { addSection } from '../domain/indemnity.ts';
import { addBookingSlots, createOnlineBooking } from '../domain/tandems.ts';
import { setupChecklist, setupPending } from './setup.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

const pending = async (dz: Parameters<typeof setupChecklist>[1]) =>
	(await setupChecklist(db, dz, NOW)).filter((s) => !s.done).map((s) => s.id);

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
		const steps = (await setupChecklist(db, { ...dz, description: 'Hi', openDays: ['sat'] }, NOW)).map((s) => (s.id === 'prices' ? { ...s, done: true } : s));
		expect(steps.find((s) => s.id === 'photo')!.done).toBe(false);
		expect(setupPending(steps)).toBe(false);
	});

	test('a priced dropzone has the prices step done', async () => {
		const { dz } = await makeDropzone(db);
		expect(await pending(dz)).not.toContain('prices');
	});

	test('tandem bookings count as open only while a weekly or upcoming slot exists, or someone has booked one', async () => {
		const { dz } = await makeDropzone(db);
		const at = (now: number) => setupChecklist(db, dz, now).then((s) => s.find((x) => x.id === 'booking')!.done);
		const DAY = 86_400_000;
		await addBookingSlots(db, { dropzoneId: dz.id, date: '2026-11-14', time: '15:00', capacity: 4 });
		expect(await at(NOW)).toBe(true); // later today
		expect(await at(NOW + DAY)).toBe(false); // that day has passed: customers can't book anything
		const weekly = await addBookingSlots(db, { dropzoneId: dz.id, date: '2026-11-21', time: '09:00', capacity: 4, repeat: 'weekly' });
		expect(weekly.added).toBe(5); // 21 Nov … 19 Dec
		expect(await at(NOW + 30 * DAY)).toBe(true);
		expect(await at(NOW + 40 * DAY)).toBe(false);
	});

	test('a dropzone that has taken an online booking keeps the step done after its slots pass', async () => {
		const { dz } = await makeDropzone(db);
		const at = (now: number) => setupChecklist(db, dz, now).then((s) => s.find((x) => x.id === 'booking')!.done);
		await addBookingSlots(db, { dropzoneId: dz.id, date: '2026-11-14', time: '15:00', capacity: 4 });
		await createOnlineBooking(db, { dropzoneId: dz.id, date: '2026-11-14', time: '15:00', jumpers: [{ name: 'Sam', email: 'sam@example.com' }], now: NOW });
		expect(await at(NOW + 90 * 86_400_000)).toBe(true);
	});
});
