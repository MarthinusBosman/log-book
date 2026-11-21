import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { jumpFormDefaults } from './logbook.ts';
import { addJump, type JumpInput } from '../domain/logbook.ts';
import { createRig } from '../domain/gear.ts';
import { DAY, NOW, freshDb, makeDropzone, makeUser } from '../domain/testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

describe('jumpFormDefaults (Log a jump prefill)', () => {
	test("each dropzone's last plane + altitude, the DZ's exit altitude otherwise, last type and rig overall", async () => {
		const user = await makeUser(db);
		const other = await makeUser(db);
		const { dz } = await makeDropzone(db);
		const { dz: coast } = await makeDropzone(db, {
			slug: 'coast',
			name: 'Coast',
			settings: { defaultAltitudeFt: 11000 }
		});
		const { dz: inland } = await makeDropzone(db, {
			slug: 'inland',
			name: 'Inland',
			settings: { defaultAltitudeFt: 14000 }
		});
		const { dz: notMine } = await makeDropzone(db, {
			slug: 'not-mine',
			name: 'Not mine'
		});
		const log = (jumpNumber: number, p: Partial<JumpInput>, userId = user.id) => addJump(db, userId, { jumpNumber, jumpDate: DAY, ...p }, NOW);
		await log(1, {
			dropzoneId: dz.id,
			aircraft: 'King Air',
			altitudeFt: 12000,
			jumpType: 'belly',
			rigId: null
		});
		await log(3, {
			dropzoneId: dz.id,
			aircraft: ' Caravan ',
			altitudeFt: 13000,
			jumpType: 'freefly'
		});
		await log(2, { dropzoneId: dz.id, aircraft: 'Skyvan', altitudeFt: 9000 }); // numbered below #3: not the latest
		await log(4, {
			dropzoneId: coast.id,
			aircraft: 'Cessna 182',
			altitudeFt: null
		});
		await log(5, {
			location: 'Boogie field',
			aircraft: 'Otter',
			altitudeFt: 10000,
			jumpType: 'wingsuit'
		});
		await log(6, {
			dropzoneId: notMine.id,
			aircraft: 'PAC 750',
			altitudeFt: 15000
		}); // not offered in the form
		await log(
			9,
			{
				dropzoneId: dz.id,
				aircraft: 'Shorts',
				altitudeFt: 4000,
				jumpType: 'hop_pop'
			},
			other.id
		);

		const d = await jumpFormDefaults(db, user.id, [dz.id, coast.id, inland.id], ['rig-a', 'rig-b']);
		expect(d.byDz).toEqual({
			[dz.id]: { aircraft: 'Caravan', altitudeFt: 13000 },
			[coast.id]: { aircraft: 'Cessna 182', altitudeFt: 11000 },
			[inland.id]: { aircraft: null, altitudeFt: 14000 },
			'': { aircraft: 'Otter', altitudeFt: 10000, location: 'Boogie field' }
		});
		// latest jump overall is #6 (no type, no rig); two active rigs = no rig guess
		expect(d.jumpType).toBeNull();
		expect(d.rigId).toBeNull();
		expect((await jumpFormDefaults(db, user.id, [], ['rig-a'])).rigId).toBe('rig-a');
	});

	test('jump type and rig follow the latest jump; a retired rig is not offered', async () => {
		const user = await makeUser(db);
		await addJump(db, user.id, { jumpNumber: 1, jumpDate: DAY, location: 'X', jumpType: 'tracking' }, NOW);
		const first = await jumpFormDefaults(db, user.id, [], []);
		expect(first).toEqual({
			byDz: { '': { aircraft: null, altitudeFt: null, location: 'X' } },
			jumpType: 'tracking',
			rigId: null
		});
		const rig = await createRig(db, { userId: user.id }, { name: 'Main rig', reserveRepackedOn: DAY });
		await addJump(db, user.id, { jumpNumber: 2, jumpDate: DAY, location: 'X', rigId: rig.id }, NOW);
		expect((await jumpFormDefaults(db, user.id, [], [rig.id, 'spare'])).rigId).toBe(rig.id);
		expect((await jumpFormDefaults(db, user.id, [], ['spare'])).rigId).toBe('spare'); // retired: fall back to the only active rig
		expect((await jumpFormDefaults(db, user.id, [], ['spare', 'other'])).rigId).toBeNull();
	});

	test('a new jumper gets nothing prefilled except the DZ exit altitude', async () => {
		const user = await makeUser(db);
		const { dz } = await makeDropzone(db, {
			settings: { defaultAltitudeFt: 12500 }
		});
		expect(await jumpFormDefaults(db, user.id, [dz.id], [])).toEqual({
			byDz: { [dz.id]: { aircraft: null, altitudeFt: 12500 } },
			jumpType: null,
			rigId: null
		});
	});
});
