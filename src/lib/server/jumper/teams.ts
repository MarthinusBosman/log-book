import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzoneMemberRoles, dropzoneMembers, users } from '../db/schema.ts';
import type { DropzoneRole } from '../../domain/constants.ts';
import { getTeam } from '../domain/teams.ts';
import { searchUsers } from '../domain/profile.ts';
import { isDomainError } from '../domain/errors.ts';
import { can } from '../domain/permissions.ts';

export const DISCIPLINES = ['Belly / FS', 'Freefly', 'VFS', 'Angle / tracking', 'Wingsuit', 'CRW', 'Canopy piloting', 'Fun jumpers', 'Other'] as const;
export const TEAM_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#64748b'] as const;
const TEAM_COLOUR_NAMES: Record<(typeof TEAM_COLOURS)[number], string> = {
	'#3b82f6': 'Blue',
	'#22c55e': 'Green',
	'#f59e0b': 'Amber',
	'#ef4444': 'Red',
	'#a855f7': 'Purple',
	'#ec4899': 'Pink',
	'#14b8a6': 'Teal',
	'#64748b': 'Slate'
};
/** Colour swatches for the team forms, each with a name for screen readers. */
export const TEAM_COLOUR_OPTIONS = TEAM_COLOURS.map((value) => ({ value, name: TEAM_COLOUR_NAMES[value] }));

/**
 * A team the user may see: owner, member, or (dropzone teams) staff with `teams.manage` there.
 * `canEdit` = the owner of a personal team, or a `teams.manage` user for a dropzone team.
 */
export async function teamFor(db: Database, userId: string, teamId: string) {
	let team;
	try {
		team = await getTeam(db, teamId);
	} catch (e) {
		if (isDomainError(e, 'not_found')) error(404, 'Team not found');
		throw e;
	}
	const isOwner = team.ownerUserId === userId;
	const isMember = team.members.some((m) => m.id === userId);
	const manages = !!team.dropzoneId && (await can(db, userId, team.dropzoneId, 'teams.manage'));
	if (!isOwner && !isMember && !manages) error(404, 'Team not found');
	return { team, isOwner, isMember, manages, canEdit: isOwner || manages };
}

/** People search for team/buddy pickers: names + licence only (never emails). */
export async function findJumpers(db: Database, q: string, excludeIds: string[] = []) {
	if (q.trim().length < 2) return [];
	const skip = new Set(excludeIds);
	return (await searchUsers(db, q, 15)).filter((u) => !skip.has(u.id)).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, licence: u.licence }));
}

type TeamLike = { dropzoneId: string | null; coachUserId: string | null; videoUserId: string | null; members: { id: string; name: string }[] };
/** DZ roles offered as a dropzone team's coach / video besides its members. */
const TEAM_STAFF_ROLES: DropzoneRole[] = ['coach', 'videographer', 'instructor', 'aff_instructor', 'tandem_instructor'];

/**
 * Who may be the team's coach / video: its members, plus (dropzone teams) the DZ's active
 * coaches, instructors and videographers, who usually aren't members. The current coach / video
 * always stay in the list so saving the settings never silently drops them.
 */
export async function teamStaffChoices(db: Database, team: TeamLike): Promise<{ id: string; name: string }[]> {
	const byId = new Map(team.members.map((m) => [m.id, m.name]));
	if (team.dropzoneId) {
		const staff = await db
			.selectDistinct({ id: users.id, name: users.name })
			.from(dropzoneMemberRoles)
			.innerJoin(dropzoneMembers, and(eq(dropzoneMembers.dropzoneId, dropzoneMemberRoles.dropzoneId), eq(dropzoneMembers.userId, dropzoneMemberRoles.userId)))
			.innerJoin(users, eq(users.id, dropzoneMemberRoles.userId))
			.where(and(eq(dropzoneMemberRoles.dropzoneId, team.dropzoneId), eq(dropzoneMembers.status, 'active'), inArray(dropzoneMemberRoles.role, TEAM_STAFF_ROLES)));
		for (const s of staff) byId.set(s.id, s.name);
	}
	const missing = [team.coachUserId, team.videoUserId].filter((id): id is string => !!id && !byId.has(id));
	if (missing.length) {
		for (const u of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, missing))) byId.set(u.id, u.name);
	}
	return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
