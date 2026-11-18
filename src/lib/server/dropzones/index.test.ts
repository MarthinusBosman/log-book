import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { freshDb, makeUser } from '../domain/testing.ts';
import { checkDropzoneBasics, checkOpeningHours, createDropzone, timezoneList } from './index.ts';

describe('checkDropzoneBasics', () => {
	test('normalises valid values', () => {
		expect(checkDropzoneBasics({ country: ' za ', timezone: 'africa/johannesburg', currency: 'zar' })).toEqual({
			ok: true,
			country: 'ZA',
			timezone: 'Africa/Johannesburg',
			currency: 'ZAR'
		});
		expect(checkDropzoneBasics({})).toEqual({ ok: true, country: null, timezone: 'UTC', currency: 'USD' });
		expect(checkDropzoneBasics({ country: '', timezone: ' ', currency: '' })).toMatchObject({ ok: true, timezone: 'UTC', currency: 'USD' });
	});

	test('rejects what would break dates and prices', () => {
		expect(checkDropzoneBasics({ timezone: 'Mars/Olympus' })).toMatchObject({ ok: false, message: expect.stringContaining('Unknown timezone') });
		expect(checkDropzoneBasics({ currency: 'ZZZZ' })).toMatchObject({ ok: false, message: expect.stringContaining('Currency') });
		expect(checkDropzoneBasics({ country: '1!' })).toMatchObject({ ok: false, message: expect.stringContaining('Unknown country') });
		// A typed code that isn't a country used to be stored and silently ignored (repack interval).
		expect(checkDropzoneBasics({ country: 'QQ' })).toMatchObject({ ok: false, message: expect.stringContaining('Pick one from the list') });
		expect(checkDropzoneBasics({ country: 'uk' })).toMatchObject({ ok: true, country: 'GB' });
	});

	test('timezone list holds common zones', () => {
		expect(timezoneList()).toContain('Africa/Johannesburg');
	});
});

describe('checkOpeningHours', () => {
	test('accepts no hours, or days with both times', () => {
		expect(checkOpeningHours({ openDays: [], openTime: null, closeTime: null })).toEqual({ ok: true });
		expect(checkOpeningHours({ openDays: ['sat'], openTime: null, closeTime: null })).toEqual({ ok: true });
		expect(checkOpeningHours({ openDays: ['sat', 'sun'], openTime: '08:00', closeTime: '18:00' })).toEqual({ ok: true });
	});

	test('refuses hours the public pages would never show', () => {
		// Hours without open days were saved but the public page said "Open by appointment".
		expect(checkOpeningHours({ openDays: [], openTime: '08:00', closeTime: '18:00' })).toMatchObject({ ok: false, message: expect.stringContaining('Tick the days') });
		expect(checkOpeningHours({ openDays: ['sat'], openTime: '08:00', closeTime: null })).toMatchObject({ ok: false, message: expect.stringContaining('both') });
		expect(checkOpeningHours({ openDays: ['sat'], openTime: null, closeTime: '18:00' })).toMatchObject({ ok: false, message: expect.stringContaining('both') });
		expect(checkOpeningHours({ openDays: ['sat'], openTime: '17:00', closeTime: '08:00' })).toMatchObject({ ok: false, message: expect.stringContaining('after opening') });
	});
});

describe('createDropzone', () => {
	let db: Database;
	beforeEach(() => {
		db = freshDb();
	});

	test('refuses an unknown timezone instead of storing it', async () => {
		const owner = await makeUser(db);
		await expect(createDropzone(db, { name: 'Bad Tz', timezone: 'Mars/Olympus' }, owner.id)).rejects.toThrow('Unknown timezone');
	});

	test('stores canonical values', async () => {
		const owner = await makeUser(db);
		const dz = await createDropzone(db, { name: 'Good Tz', timezone: 'europe/london', currency: 'gbp', country: 'gb' }, owner.id);
		expect([dz.timezone, dz.currency, dz.country]).toEqual(['Europe/London', 'GBP', 'GB']);
	});
});
