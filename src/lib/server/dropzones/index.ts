import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzoneMemberRoles, dropzoneMembers, dropzones, type Dropzone } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { ROLE_PRECEDENCE, STAFF_ROLES, type DropzoneRole } from '../../domain/constants.ts';
import { seedDefaultPricelist } from '../domain/pricing.ts';

import type { Membership } from '../../types.ts';
export type { Membership };
export { STAFF_ROLES };

/** Cookie holding the active dropzone slug. */
export const DZ_COOKIE = 'dz';

export function isStaffRole(role: DropzoneRole | null | undefined): boolean {
	return !!role && STAFF_ROLES.includes(role);
}

/** True when any of the roles is a staff role. */
export function hasStaffRole(roles: readonly DropzoneRole[] | null | undefined): boolean {
	return !!roles && roles.some((r) => STAFF_ROLES.includes(r));
}

export function primaryRole(roles: readonly DropzoneRole[]): DropzoneRole {
	return ROLE_PRECEDENCE.find((r) => roles.includes(r)) ?? 'jumper';
}

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
}

export async function listMemberships(db: Database, userId: string): Promise<Membership[]> {
	const rows = await db
		.select({
			dropzone: {
				id: dropzones.id,
				slug: dropzones.slug,
				name: dropzones.name,
				country: dropzones.country
			},
			role: dropzoneMemberRoles.role
		})
		.from(dropzoneMembers)
		.innerJoin(dropzones, eq(dropzoneMembers.dropzoneId, dropzones.id))
		.leftJoin(
			dropzoneMemberRoles,
			and(
				eq(dropzoneMemberRoles.dropzoneId, dropzoneMembers.dropzoneId),
				eq(dropzoneMemberRoles.userId, dropzoneMembers.userId)
			)
		)
		.where(and(eq(dropzoneMembers.userId, userId), eq(dropzoneMembers.status, 'active')))
		.orderBy(dropzones.name);
	const byDz = new Map<string, { dropzone: Membership['dropzone']; roles: DropzoneRole[] }>();
	for (const r of rows) {
		const m = byDz.get(r.dropzone.id) ?? { dropzone: r.dropzone, roles: [] };
		if (r.role && !m.roles.includes(r.role)) m.roles.push(r.role);
		byDz.set(r.dropzone.id, m);
	}
	return [...byDz.values()].map((m) => {
		const roles = m.roles.length ? m.roles : (['jumper'] as DropzoneRole[]);
		roles.sort((a, b) => ROLE_PRECEDENCE.indexOf(a) - ROLE_PRECEDENCE.indexOf(b));
		return { dropzone: m.dropzone, roles, role: primaryRole(roles) };
	});
}

export async function createDropzone(
	db: Database,
	input: { name: string; slug?: string; country?: string | null; timezone?: string; currency?: string },
	ownerId: string
): Promise<Dropzone> {
	const id = newId();
	const rows = await db
		.insert(dropzones)
		.values({
			id,
			slug: input.slug ? slugify(input.slug) : slugify(input.name),
			name: input.name.trim(),
			country: input.country ?? null,
			timezone: input.timezone ?? 'UTC',
			currency: input.currency ?? 'USD'
		})
		.returning();
	await db.insert(dropzoneMembers).values({ dropzoneId: id, userId: ownerId });
	await db.insert(dropzoneMemberRoles).values({ dropzoneId: id, userId: ownerId, role: 'owner' });
	// Like the original: a new DZ starts with an (all-zero) price list.
	await seedDefaultPricelist(db, id);
	return rows[0];
}

export async function findDropzoneBySlug(db: Database, slug: string) {
	const rows = await db.select().from(dropzones).where(eq(dropzones.slug, slug)).limit(1);
	return rows[0];
}
