import { and, asc, eq, like, or } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import {
	aircraft,
	dropzoneFollows,
	dropzoneMemberRoles,
	dropzoneMembers,
	dropzonePaymentConfigs,
	dropzones,
	dropzoneSubscriptions,
	users,
	WEEKDAYS,
	type Aircraft,
	type Dropzone,
	type DropzonePaymentConfig,
	type DropzoneSettings
} from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { DropzoneRole } from '../../domain/constants.ts';
import { DomainError, assertFound } from './errors.ts';

export type DropzoneDetailsPatch = Partial<
	Pick<
		Dropzone,
		| 'name'
		| 'description'
		| 'country'
		| 'timezone'
		| 'currency'
		| 'lat'
		| 'lng'
		| 'address'
		| 'contactEmail'
		| 'contactPhone'
		| 'website'
		| 'photoFileId'
		| 'openDays'
		| 'openTime'
		| 'closeTime'
		| 'listed'
		| 'paymentsOn'
		| 'walletEnabled'
		| 'walletAllowNegative'
		| 'payAtManifest'
		| 'emailNotices'
		| 'indemnityTandemActive'
		| 'indemnitySportActive'
		| 'repackIntervalDays'
	>
>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function getDropzone(db: Database, id: string): Promise<Dropzone> {
	return assertFound((await db.select().from(dropzones).where(eq(dropzones.id, id)).limit(1))[0], 'Dropzone');
}

export async function updateDropzone(db: Database, id: string, patch: DropzoneDetailsPatch): Promise<Dropzone> {
	if (patch.name !== undefined && !patch.name.trim()) throw new DomainError('invalid', 'Dropzone name is required');
	for (const k of ['openTime', 'closeTime'] as const) {
		if (patch[k] && !TIME_RE.test(patch[k]!)) throw new DomainError('invalid', `${k} must be HH:MM`);
	}
	if (patch.openDays && patch.openDays.some((d) => !WEEKDAYS.includes(d))) throw new DomainError('invalid', 'Unknown weekday');
	if (patch.currency) patch.currency = patch.currency.toUpperCase();
	return assertFound((await db.update(dropzones).set(patch).where(eq(dropzones.id, id)).returning())[0], 'Dropzone');
}

/** Merge keys into the JSON settings blob. */
export async function updateDropzoneSettings(db: Database, id: string, patch: DropzoneSettings): Promise<DropzoneSettings> {
	const dz = await getDropzone(db, id);
	const settings = { ...dz.settings, ...patch };
	await db.update(dropzones).set({ settings }).where(eq(dropzones.id, id));
	return settings;
}

/** Public directory: listed dropzones (optionally only with an active/trialing subscription). */
export async function listPublicDropzones(db: Database, opts: { search?: string; requireSubscription?: boolean } = {}) {
	const q = opts.search?.trim();
	const rows = await db
		.select({ dz: dropzones, sub: dropzoneSubscriptions.status })
		.from(dropzones)
		.leftJoin(dropzoneSubscriptions, eq(dropzoneSubscriptions.dropzoneId, dropzones.id))
		.where(and(eq(dropzones.listed, true), q ? or(like(dropzones.name, `%${q}%`), like(dropzones.address, `%${q}%`)) : undefined))
		.orderBy(asc(dropzones.name));
	return rows.filter((r) => !opts.requireSubscription || r.sub === 'active' || r.sub === 'trialing').map((r) => r.dz);
}

/** Haversine distance in km (dropzone list "{n} km away"). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

// ── staff / members ──

export type StaffMember = { userId: string; name: string; avatar: string | null; email: string; licence: string | null; status: string; roles: { role: DropzoneRole; colour: string | null }[] };

/** Members of a DZ with all their roles. */
export async function listMembers(db: Database, dropzoneId: string): Promise<StaffMember[]> {
	const rows = await db
		.select({
			userId: users.id,
			name: users.name,
			avatar: users.avatar,
			email: users.email,
			licence: users.licence,
			status: dropzoneMembers.status,
			role: dropzoneMemberRoles.role,
			colour: dropzoneMemberRoles.colour
		})
		.from(dropzoneMembers)
		.innerJoin(users, eq(users.id, dropzoneMembers.userId))
		.leftJoin(
			dropzoneMemberRoles,
			and(eq(dropzoneMemberRoles.dropzoneId, dropzoneMembers.dropzoneId), eq(dropzoneMemberRoles.userId, dropzoneMembers.userId))
		)
		.where(eq(dropzoneMembers.dropzoneId, dropzoneId))
		.orderBy(asc(users.name));
	const by = new Map<string, StaffMember>();
	for (const r of rows) {
		const m = by.get(r.userId) ?? { userId: r.userId, name: r.name, avatar: r.avatar, email: r.email, licence: r.licence, status: r.status, roles: [] };
		if (r.role) m.roles.push({ role: r.role, colour: r.colour });
		by.set(r.userId, m);
	}
	return [...by.values()];
}

export async function setRoleColour(db: Database, dropzoneId: string, userId: string, role: DropzoneRole, colour: string | null): Promise<void> {
	await db
		.update(dropzoneMemberRoles)
		.set({ colour })
		.where(and(eq(dropzoneMemberRoles.dropzoneId, dropzoneId), eq(dropzoneMemberRoles.userId, userId), eq(dropzoneMemberRoles.role, role)));
}

export async function removeMember(db: Database, dropzoneId: string, userId: string): Promise<void> {
	const owner = await db
		.select({ u: dropzoneMemberRoles.userId })
		.from(dropzoneMemberRoles)
		.where(and(eq(dropzoneMemberRoles.dropzoneId, dropzoneId), eq(dropzoneMemberRoles.role, 'owner')));
	if (owner.length === 1 && owner[0].u === userId) throw new DomainError('conflict', 'A dropzone needs at least one owner');
	await db.delete(dropzoneMemberRoles).where(and(eq(dropzoneMemberRoles.dropzoneId, dropzoneId), eq(dropzoneMemberRoles.userId, userId)));
	await db.delete(dropzoneMembers).where(and(eq(dropzoneMembers.dropzoneId, dropzoneId), eq(dropzoneMembers.userId, userId)));
}

// ── followers ──

export async function followDropzone(db: Database, dropzoneId: string, userId: string, opts: { favourite?: boolean } = {}): Promise<void> {
	await db
		.insert(dropzoneFollows)
		.values({ dropzoneId, userId, favourite: opts.favourite ?? false })
		.onConflictDoUpdate({
			target: [dropzoneFollows.dropzoneId, dropzoneFollows.userId],
			set: opts.favourite !== undefined ? { favourite: opts.favourite } : { notify: true }
		});
}

export async function unfollowDropzone(db: Database, dropzoneId: string, userId: string): Promise<void> {
	await db.delete(dropzoneFollows).where(and(eq(dropzoneFollows.dropzoneId, dropzoneId), eq(dropzoneFollows.userId, userId)));
}

export async function listFollowedDropzones(db: Database, userId: string) {
	return db
		.select({ dropzone: dropzones, favourite: dropzoneFollows.favourite })
		.from(dropzoneFollows)
		.innerJoin(dropzones, eq(dropzones.id, dropzoneFollows.dropzoneId))
		.where(eq(dropzoneFollows.userId, userId))
		.orderBy(asc(dropzones.name));
}

// ── aircraft ──

export type AircraftInput = { name: string; tailNumber?: string | null; capacity: number; weightLimitKg?: number | null; defaultPilotId?: string | null; active?: boolean };

function validateAircraft(a: Partial<AircraftInput>) {
	if (a.name !== undefined && !a.name.trim()) throw new DomainError('invalid', 'Plane name is required');
	if (a.capacity !== undefined && (!Number.isInteger(a.capacity) || a.capacity < 1)) throw new DomainError('invalid', 'Pax must be at least 1');
	if (a.weightLimitKg != null && a.weightLimitKg <= 0) throw new DomainError('invalid', 'Weight limit must be positive');
}

export async function createAircraft(db: Database, dropzoneId: string, input: AircraftInput): Promise<Aircraft> {
	validateAircraft(input);
	return (await db.insert(aircraft).values({ id: newId(), dropzoneId, ...input, name: input.name.trim() }).returning())[0];
}

export async function updateAircraft(db: Database, id: string, patch: Partial<AircraftInput>): Promise<Aircraft> {
	validateAircraft(patch);
	return assertFound((await db.update(aircraft).set(patch).where(eq(aircraft.id, id)).returning())[0], 'Aircraft');
}

export async function deleteAircraft(db: Database, id: string): Promise<void> {
	await db.delete(aircraft).where(eq(aircraft.id, id));
}

export async function listAircraft(db: Database, dropzoneId: string, opts: { activeOnly?: boolean } = {}): Promise<Aircraft[]> {
	return db
		.select()
		.from(aircraft)
		.where(and(eq(aircraft.dropzoneId, dropzoneId), opts.activeOnly ? eq(aircraft.active, true) : undefined))
		.orderBy(asc(aircraft.name));
}

// ── payment config & subscription ──

export async function getPaymentConfig(db: Database, dropzoneId: string): Promise<DropzonePaymentConfig | undefined> {
	return (await db.select().from(dropzonePaymentConfigs).where(eq(dropzonePaymentConfigs.dropzoneId, dropzoneId)).limit(1))[0];
}

/** Upsert provider config. Secrets must be encrypted by the caller (payments module, TODO). */
export async function savePaymentConfig(
	db: Database,
	dropzoneId: string,
	patch: Partial<Omit<DropzonePaymentConfig, 'dropzoneId' | 'updatedAt'>>
): Promise<void> {
	await db
		.insert(dropzonePaymentConfigs)
		.values({ dropzoneId, ...patch })
		.onConflictDoUpdate({ target: dropzonePaymentConfigs.dropzoneId, set: { ...patch, updatedAt: new Date() } });
}

export async function getSubscription(db: Database, dropzoneId: string) {
	return (await db.select().from(dropzoneSubscriptions).where(eq(dropzoneSubscriptions.dropzoneId, dropzoneId)).limit(1))[0];
}

export async function upsertSubscription(
	db: Database,
	dropzoneId: string,
	patch: Partial<Omit<typeof dropzoneSubscriptions.$inferInsert, 'dropzoneId'>>
): Promise<void> {
	await db
		.insert(dropzoneSubscriptions)
		.values({ dropzoneId, ...patch })
		.onConflictDoUpdate({ target: dropzoneSubscriptions.dropzoneId, set: { ...patch, updatedAt: new Date() } });
}
