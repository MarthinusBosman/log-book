import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { freshDb, makeUser } from '../domain/testing.ts';
import { checkDropzoneBasics, createDropzone, timezoneList } from './index.ts';

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
