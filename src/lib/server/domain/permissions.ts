import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzoneMemberRoles, dropzoneMembers, users } from '../db/schema.ts';
import {
	ROLE_CAPABILITIES,
	type Capability,
	type DropzoneRole
} from '../../domain/constants.ts';
import { DomainError } from './errors.ts';
import { notify } from './notifications.ts';

/** Pure: does any of these roles grant the capability? */
export function rolesCan(roles: readonly DropzoneRole[], capability: Capability): boolean {
	return roles.some((r) => ROLE_CAPABILITIES[r]?.includes(capability));
}

/** All capabilities granted by a set of roles (for passing to the UI). */
export function capabilitiesOf(roles: readonly DropzoneRole[]): Capability[] {
	return [...new Set(roles.flatMap((r) => ROLE_CAPABILITIES[r] ?? []))];
}

/** Active roles of a user at a dropzone ([] when not an active member). */
export async function getRoles(db: Database, userId: string, dropzoneId: string): Promise<DropzoneRole[]> {
	const rows = await db
		.select({ role: dropzoneMemberRoles.role })
		.from(dropzoneMemberRoles)
		.innerJoin(
			dropzoneMembers,
			and(
				eq(dropzoneMembers.dropzoneId, dropzoneMemberRoles.dropzoneId),
				eq(dropzoneMembers.userId, dropzoneMemberRoles.userId)
			)
		)
		.where(
			and(
				eq(dropzoneMemberRoles.userId, userId),
				eq(dropzoneMemberRoles.dropzoneId, dropzoneId),
				eq(dropzoneMembers.status, 'active')
			)
		);
	return rows.map((r) => r.role);
}

async function isSuperAdmin(db: Database, userId: string): Promise<boolean> {
	const rows = await db.select({ s: users.isSuperAdmin }).from(users).where(eq(users.id, userId)).limit(1);
	return !!rows[0]?.s;
}

/** can(user, dz, capability) — super-admins can do everything. */
export async function can(db: Database, userId: string, dropzoneId: string, capability: Capability): Promise<boolean> {
	if (rolesCan(await getRoles(db, userId, dropzoneId), capability)) return true;
	return isSuperAdmin(db, userId);
}

/** Throws DomainError('forbidden') unless `can`. */
export async function requireCan(db: Database, userId: string, dropzoneId: string, capability: Capability): Promise<void> {
	if (!(await can(db, userId, dropzoneId, capability))) {
		throw new DomainError('forbidden', `Missing permission: ${capability}`);
	}
}

/** Ensure a membership row exists (status active). */
export async function ensureMember(db: Database, dropzoneId: string, userId: string): Promise<void> {
	await db
		.insert(dropzoneMembers)
		.values({ dropzoneId, userId, status: 'active' })
		.onConflictDoNothing();
}

/** Grant a role (idempotent). Notifies `added_staff` when a staff role is newly granted. */
export async function grantRole(
	db: Database,
	input: { dropzoneId: string; userId: string; role: DropzoneRole; colour?: string | null; by?: string | null; dropzoneName?: string }
): Promise<boolean> {
	await ensureMember(db, input.dropzoneId, input.userId);
	const res = await db
		.insert(dropzoneMemberRoles)
		.values({ dropzoneId: input.dropzoneId, userId: input.userId, role: input.role, colour: input.colour ?? null })
		.onConflictDoNothing()
		.returning({ role: dropzoneMemberRoles.role });
	const added = res.length > 0;
	if (added && input.role !== 'jumper' && input.by && input.by !== input.userId) {
		await notify(db, {
			userIds: [input.userId],
			type: 'added_staff',
			dropzoneId: input.dropzoneId,
			actorUserId: input.by,
			payload: { dropzoneName: input.dropzoneName, role: input.role }
		});
	}
	return added;
}

export async function revokeRole(db: Database, dropzoneId: string, userId: string, role: DropzoneRole): Promise<void> {
	if (role === 'owner') {
		const owners = await db
			.select({ u: dropzoneMemberRoles.userId })
			.from(dropzoneMemberRoles)
			.where(and(eq(dropzoneMemberRoles.dropzoneId, dropzoneId), eq(dropzoneMemberRoles.role, 'owner')));
		if (owners.length <= 1 && owners[0]?.u === userId) {
			throw new DomainError('conflict', 'A dropzone needs at least one owner');
		}
	}
	await db
		.delete(dropzoneMemberRoles)
		.where(
			and(
				eq(dropzoneMemberRoles.dropzoneId, dropzoneId),
				eq(dropzoneMemberRoles.userId, userId),
				eq(dropzoneMemberRoles.role, role)
			)
		);
}

/** Members holding a role (e.g. list pilots / TIs for pickers). */
export async function listUsersWithRole(db: Database, dropzoneId: string, role: DropzoneRole) {
	return db
		.select({ id: users.id, name: users.name, avatar: users.avatar, email: users.email, colour: dropzoneMemberRoles.colour, weightKg: users.weightKg })
		.from(dropzoneMemberRoles)
		.innerJoin(users, eq(users.id, dropzoneMemberRoles.userId))
		.where(and(eq(dropzoneMemberRoles.dropzoneId, dropzoneId), eq(dropzoneMemberRoles.role, role)))
		.orderBy(users.name);
}

