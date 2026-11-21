import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { aircraft } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { aircraftOptions } from './logbook.ts';
import { addJump } from '../domain/logbook.ts';
import { createAircraft } from '../domain/dropzone-admin.ts';
import { DAY, NOW, freshDb, makeDropzone, makeUser } from '../domain/testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

describe('aircraftOptions (jump form suggestions)', () => {
	test("past planes by use, then the dropzones' active fleet, without case duplicates", async () => {
		const user = await makeUser(db);
		const other = await makeUser(db);
		const { dz } = await makeDropzone(db);
		const { dz: elsewhere } = await makeDropzone(db, { slug: 'elsewhere', name: 'Elsewhere' });
		let n = 1;
		const log = (plane: string | null, userId = user.id) => addJump(db, userId, { jumpNumber: n++, jumpDate: DAY, location: 'Somewhere', aircraft: plane }, NOW);
		await log('King Air');
		await log('Cessna 182');
		await log('Cessna 182');
		await log(null);
		await log('  ');
		await log('Skyvan', other.id); // someone else's logbook
		await createAircraft(db, dz.id, { name: 'cessna 182', tailNumber: null, capacity: 4, weightLimitKg: null });
		await createAircraft(db, dz.id, { name: 'Caravan', tailNumber: null, capacity: 16, weightLimitKg: null });
		const old = await createAircraft(db, dz.id, { name: 'Old Otter', tailNumber: null, capacity: 20, weightLimitKg: null });
		await db.update(aircraft).set({ active: false }).where(eq(aircraft.id, old.id));
		await createAircraft(db, elsewhere.id, { name: 'PAC 750', tailNumber: null, capacity: 14, weightLimitKg: null });

		expect(await aircraftOptions(db, user.id, [dz.id])).toEqual(['Cessna 182', 'King Air', 'Caravan']);
		expect(await aircraftOptions(db, user.id, [])).toEqual(['Cessna 182', 'King Air']);
		expect(await aircraftOptions(db, user.id, [dz.id], 2)).toEqual(['Cessna 182', 'King Air']);
		expect(await aircraftOptions(db, other.id, [dz.id, elsewhere.id])).toEqual(['Skyvan', 'Caravan', 'PAC 750', 'cessna 182']);
	});
});
