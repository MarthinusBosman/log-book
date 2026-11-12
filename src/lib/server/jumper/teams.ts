import { error } from '@sveltejs/kit';
import type { Database } from '../db/index.ts';
import { getTeam } from '../domain/teams.ts';
import { searchUsers } from '../domain/profile.ts';
import { isDomainError } from '../domain/errors.ts';

export const DISCIPLINES = ['Belly / FS', 'Freefly', 'VFS', 'Angle / tracking', 'Wingsuit', 'CRW', 'Canopy piloting', 'Fun jumpers', 'Other'] as const;
export const TEAM_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#64748b'] as const;

/** A team the user may see (owner or member). `canEdit` = personal team owned by the user. */
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
	if (!isOwner && !isMember) error(404, 'Team not found');
	return { team, isOwner, isMember, canEdit: isOwner };
}

/** People search for team/buddy pickers: names + licence only (never emails). */
export async function findJumpers(db: Database, q: string, excludeIds: string[] = []) {
	if (q.trim().length < 2) return [];
	const skip = new Set(excludeIds);
	return (await searchUsers(db, q, 15)).filter((u) => !skip.has(u.id)).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, licence: u.licence }));
}
