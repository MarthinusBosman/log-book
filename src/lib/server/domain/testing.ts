/**
 * Test fixtures: fresh in-memory SQLite with the real migrations + a priced demo dropzone.
 * Only imported by *.test.ts (never by app code — bun:sqlite).
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { openSqlite } from '../db/sqlite.ts';
import { dropzones, users, type Dropzone, type User } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { createDropzone } from '../dropzones/index.ts';
import type { DropzoneRole } from '../../domain/constants.ts';
import { grantRole } from './permissions.ts';
import { setPrices, type PriceMap } from './pricing.ts';

export const DAY = '2026-11-14';
export const NOW = Date.parse('2026-11-14T08:00:00Z');

/** ZAR price list used by tests (minor units). */
export const TEST_PRICES: PriceMap = {
	sport_slot: 40000,
	hop_pop: 30000,
	gear_rental: 15000,
	extra_altitude: 10000,
	max_altitude: 20000,
	special_event: 5000,
	static_line: 90000,
	static_line_course: 350000,
	isp: 60000,
	coach: 80000,
	aff_1_3: 250000,
	aff_4_7: 200000,
	aff_8_10: 150000,
	aff_course: 1800000,
	tandem_deposit: 50000,
	tandem_slot: 320000,
	tandem_outside_video: 120000,
	tandem_handcam: 80000,
	tandem_extreme_ride: 30000,
	tandem_beach_landing: 40000,
	tandem_extra_altitude: 50000,
	tandem_max_altitude: 90000,
	pay_tandem: 90000,
	pay_tandem_video: 60000,
	pay_handcam: 20000,
	pay_aff: 70000,
	pay_coach: 40000,
	pay_pilot: 50000
};

export function freshDb(): Database {
	return openSqlite({ path: ':memory:', migrationsFolder: 'drizzle' });
}

let n = 0;
export async function makeUser(db: Database, patch: Partial<User> = {}): Promise<User> {
	n++;
	const rows = await db
		.insert(users)
		.values({ id: newId(), email: `user${n}-${newId().slice(0, 6)}@example.com`, name: `User ${n}`, loadingWeightKg: 90, ...patch })
		.returning();
	return rows[0];
}

export async function makeDropzone(db: Database, patch: Partial<Dropzone> = {}, prices: PriceMap = TEST_PRICES) {
	const owner = await makeUser(db, { name: 'Olive Owner', licence: 'D-1001' });
	const dz = await createDropzone(db, { name: `Test DZ ${newId().slice(0, 6)}`, currency: 'ZAR', country: 'ZA', timezone: 'Africa/Johannesburg' }, owner.id);
	if (Object.keys(patch).length) await db.update(dropzones).set(patch).where(eq(dropzones.id, dz.id));
	await setPrices(db, dz.id, prices);
	const fresh = (await db.select().from(dropzones).where(eq(dropzones.id, dz.id)))[0];
	return { dz: fresh, owner };
}

export async function makeMember(db: Database, dropzoneId: string, roles: DropzoneRole[], patch: Partial<User> = {}) {
	const u = await makeUser(db, patch);
	for (const role of roles) await grantRole(db, { dropzoneId, userId: u.id, role });
	return u;
}
