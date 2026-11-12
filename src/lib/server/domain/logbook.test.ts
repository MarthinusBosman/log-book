import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { isDomainError } from './errors.ts';
import { addJump, deleteJump, importJumps, listJumps, logbookTotals, nextJumpNumber, signJump, updateJump } from './logbook.ts';
import { setRatings } from './profile.ts';
import { addSlot, completeLoad, createLoads } from './loads.ts';
import { DAY, freshDb, makeDropzone, makeUser } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

describe('numbering', () => {
	test('starts after the declared jump count and increments', async () => {
		const u = await makeUser(db, { declaredJumpCount: 49 });
		expect(await nextJumpNumber(db, u.id)).toBe(50);
		const j = await addJump(db, u.id, { jumpDate: '2026-11-01', location: 'Skydive Demo DZ', freefallSeconds: 55 });
		expect(j.jumpNumber).toBe(50);
		expect(j.source).toBe('manual');
		expect(j.verified).toBe(false);
		await addJump(db, u.id, { jumpDate: '2026-11-02', jumpNumber: 75 });
		expect(await nextJumpNumber(db, u.id)).toBe(76);
	});

	test('load completion continues the manual numbering', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		await addJump(db, u.id, { jumpDate: '2026-11-01' });
		await addJump(db, u.id, { jumpDate: '2026-11-02' });
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4 });
		await addSlot(db, load.id, { userId: u.id, jumpType: 'belly' });
		await completeLoad(db, load.id);
		const list = await listJumps(db, u.id);
		expect(list.map((j) => j.jumpNumber)).toEqual([3, 2, 1]);
		expect(list[0]).toMatchObject({ source: 'load', verified: true });
	});

	test('validation', async () => {
		const u = await makeUser(db);
		await expect(addJump(db, u.id, { jumpDate: '' })).rejects.toThrow(/date/);
		await expect(addJump(db, u.id, { jumpDate: DAY, jumpNumber: 0 })).rejects.toThrow(/positive/);
		await expect(addJump(db, u.id, { jumpDate: DAY, freefallSeconds: -1 })).rejects.toThrow();
	});
});

describe('sign-off', () => {
	test('needs another, licensed jumper; stores a snapshot and notifies', async () => {
		const owner = await makeUser(db);
		const unlicensed = await makeUser(db);
		const instructor = await makeUser(db, { name: 'Ivan Instructor', licence: 'D-4242' });
		const j = await addJump(db, owner.id, { jumpDate: DAY });
		expect(isDomainError(await signJump(db, { jumpId: j.id, signerUserId: owner.id }).catch((e) => e), 'cannot_sign_own_jump')).toBe(true);
		expect(isDomainError(await signJump(db, { jumpId: j.id, signerUserId: unlicensed.id }).catch((e) => e), 'signer_not_licensed')).toBe(true);
		const signed = await signJump(db, { jumpId: j.id, signerUserId: instructor.id, now: Date.parse('2026-11-14T12:00:00Z') });
		expect(signed).toMatchObject({ signerUserId: instructor.id, signerName: 'Ivan Instructor', signerLicence: 'D-4242' });
		expect(signed.signedAt).toBeInstanceOf(Date);
		// a rating also qualifies
		await setRatings(db, unlicensed.id, 'pasa', [{ rating: 'Coach' }]);
		await signJump(db, { jumpId: j.id, signerUserId: unlicensed.id });
	});

	test('editing jump facts clears the signature; description edits keep it', async () => {
		const owner = await makeUser(db);
		const signer = await makeUser(db, { licence: 'C-1' });
		const j = await addJump(db, owner.id, { jumpDate: DAY, altitudeFt: 12000 });
		await signJump(db, { jumpId: j.id, signerUserId: signer.id });
		const d = await updateJump(db, owner.id, j.id, { description: 'Great sunset jump' });
		expect(d.signedAt).not.toBeNull();
		const a = await updateJump(db, owner.id, j.id, { altitudeFt: 14000 });
		expect(a.signedAt).toBeNull();
		expect(a.signerUserId).toBeNull();
	});

	test('only the owner edits/deletes; verified jumps keep date/DZ/aircraft', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		const other = await makeUser(db);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4 });
		await addSlot(db, load.id, { userId: u.id, jumpType: 'belly' });
		await completeLoad(db, load.id);
		const [j] = await listJumps(db, u.id);
		expect(isDomainError(await updateJump(db, other.id, j.id, { description: 'x' }).catch((e) => e), 'forbidden')).toBe(true);
		await expect(updateJump(db, u.id, j.id, { jumpDate: '2020-01-01' })).rejects.toThrow(/verified/);
		await updateJump(db, u.id, j.id, { freefallSeconds: 60, description: 'Belly 2-way' });
		expect(isDomainError(await deleteJump(db, other.id, j.id).catch((e) => e), 'forbidden')).toBe(true);
		await deleteJump(db, u.id, j.id);
		expect(await listJumps(db, u.id)).toHaveLength(0);
	});
});

describe('totals & import', () => {
	test('totals', async () => {
		const u = await makeUser(db, { declaredJumpCount: 10 });
		const signer = await makeUser(db, { licence: 'D-1' });
		await addJump(db, u.id, { jumpDate: '2025-06-01', freefallSeconds: 50 });
		const j = await addJump(db, u.id, { jumpDate: '2026-11-10', freefallSeconds: 60 });
		await signJump(db, { jumpId: j.id, signerUserId: signer.id });
		const t = await logbookTotals(db, u.id, DAY);
		expect(t).toEqual({
			logged: 2,
			totalJumps: 12,
			totalFreefallSeconds: 110,
			signed: 1,
			verified: 0,
			lastJumpDate: '2026-11-10',
			last30Days: 1,
			last12Months: 1
		});
	});

	test('import is idempotent on sourceRef', async () => {
		const u = await makeUser(db);
		const rows = Array.from({ length: 12 }, (_, i) => ({
			jumpNumber: i + 1,
			jumpDate: `2025-01-${String(i + 1).padStart(2, '0')}`,
			sourceRef: `users/x/jumps/${i}`,
			location: 'Old DZ'
		}));
		expect(await importJumps(db, u.id, rows)).toBe(12);
		expect(await importJumps(db, u.id, rows)).toBe(0);
		expect(await nextJumpNumber(db, u.id)).toBe(13);
	});
});
