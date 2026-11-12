import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { teamMembers, teams, userBuddies, users, type Slot, type Team } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { JumpType, SlotExtra } from '../../domain/constants.ts';
import { DomainError, assertFound } from './errors.ts';
import { notify } from './notifications.ts';
import { addSlots, type AddSlotOptions, type SlotInput } from './loads.ts';

export type TeamInput = {
	name: string;
	discipline?: string | null;
	colour?: string | null;
	coachUserId?: string | null;
	videoUserId?: string | null;
	memberIds?: string[];
};

/** DZ team (owner = dropzone) or a jumper's personal team (owner = user). */
export async function createTeam(
	db: Database,
	owner: { dropzoneId: string } | { userId: string },
	input: TeamInput,
	opts: { by?: string | null; now?: number } = {}
): Promise<Team> {
	if (!input.name?.trim()) throw new DomainError('invalid', 'Team name is required');
	const id = newId();
	const row = (
		await db
			.insert(teams)
			.values({
				id,
				dropzoneId: 'dropzoneId' in owner ? owner.dropzoneId : null,
				ownerUserId: 'userId' in owner ? owner.userId : null,
				name: input.name.trim(),
				discipline: input.discipline ?? null,
				colour: input.colour ?? null,
				coachUserId: input.coachUserId ?? null,
				videoUserId: input.videoUserId ?? null
			})
			.returning()
	)[0];
	for (const m of input.memberIds ?? []) await addTeamMember(db, id, m, opts);
	return row;
}

export async function updateTeam(db: Database, teamId: string, patch: Partial<Omit<TeamInput, 'memberIds'>>): Promise<void> {
	await db.update(teams).set(patch).where(eq(teams.id, teamId));
}

export async function deleteTeam(db: Database, teamId: string): Promise<void> {
	await db.delete(teams).where(eq(teams.id, teamId));
}

/** Add a member (idempotent); notifies `team_add` when added by someone else. */
export async function addTeamMember(db: Database, teamId: string, userId: string, opts: { by?: string | null; now?: number } = {}): Promise<boolean> {
	const team = assertFound((await db.select().from(teams).where(eq(teams.id, teamId)).limit(1))[0], 'Team');
	const res = await db.insert(teamMembers).values({ teamId, userId }).onConflictDoNothing().returning({ u: teamMembers.userId });
	if (res.length && opts.by && opts.by !== userId) {
		const actor = (await db.select({ n: users.name }).from(users).where(eq(users.id, opts.by)).limit(1))[0];
		await notify(db, {
			userIds: [userId],
			type: 'team_add',
			dropzoneId: team.dropzoneId,
			actorUserId: opts.by,
			payload: { actorName: actor?.n, teamName: team.name },
			now: opts.now
		});
	}
	return res.length > 0;
}

export async function removeTeamMember(db: Database, teamId: string, userId: string): Promise<void> {
	await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
}

export async function getTeam(db: Database, teamId: string) {
	const team = assertFound((await db.select().from(teams).where(eq(teams.id, teamId)).limit(1))[0], 'Team');
	const members = await db
		.select({ id: users.id, name: users.name, avatar: users.avatar, email: users.email, licence: users.licence })
		.from(teamMembers)
		.innerJoin(users, eq(users.id, teamMembers.userId))
		.where(eq(teamMembers.teamId, teamId))
		.orderBy(users.name);
	return { ...team, members };
}

export async function listDropzoneTeams(db: Database, dropzoneId: string) {
	const list = await db.select().from(teams).where(eq(teams.dropzoneId, dropzoneId)).orderBy(teams.name);
	return Promise.all(list.map((t) => getTeam(db, t.id)));
}

export async function listUserTeams(db: Database, userId: string) {
	const owned = await db.select({ id: teams.id }).from(teams).where(eq(teams.ownerUserId, userId));
	const member = await db.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId));
	const ids = [...new Set([...owned, ...member].map((r) => r.id))];
	if (ids.length === 0) return [];
	return Promise.all(ids.map((id) => getTeam(db, id)));
}

/**
 * Manifest a whole team on a load in one action (one jump group). Optional coach/video from the
 * team join as staff slots. All-or-nothing: capacity, duplicates and wallets checked for everyone.
 */
export async function manifestTeam(
	db: Database,
	input: { teamId: string; loadId: string; jumpType: JumpType; extras?: SlotExtra[]; memberIds?: string[]; includeStaff?: boolean },
	opts: AddSlotOptions = {}
): Promise<Slot[]> {
	const team = await getTeam(db, input.teamId);
	const ids = input.memberIds ?? team.members.map((m) => m.id);
	if (ids.length === 0) throw new DomainError('invalid', 'Not enough jumpers');
	const groupId = newId();
	const common = { groupId, teamId: team.id, teamName: team.name, colour: team.colour };
	const list: SlotInput[] = ids.map((userId) => ({ ...common, userId, jumpType: input.jumpType, extras: input.extras }));
	if (input.includeStaff !== false) {
		if (team.coachUserId && !ids.includes(team.coachUserId)) {
			list.push({ ...common, userId: team.coachUserId, jumpType: input.jumpType, extras: [], staffRole: 'coach' });
		}
		if (team.videoUserId && !ids.includes(team.videoUserId)) {
			list.push({ ...common, userId: team.videoUserId, jumpType: input.jumpType, extras: [], staffRole: 'videographer' });
		}
	}
	return addSlots(db, input.loadId, list, opts);
}

/** Manifest an ad-hoc jump group (multi-select in "Add jumper/s to load"). */
export async function manifestGroup(
	db: Database,
	input: { loadId: string; userIds: string[]; jumpType: JumpType; extras?: SlotExtra[]; teamName?: string | null },
	opts: AddSlotOptions = {}
): Promise<Slot[]> {
	const groupId = input.userIds.length > 1 ? newId() : null;
	return addSlots(
		db,
		input.loadId,
		input.userIds.map((userId) => ({ userId, jumpType: input.jumpType, extras: input.extras, groupId, teamName: input.teamName ?? null })),
		opts
	);
}

// ── jump buddies ──

export async function addBuddy(db: Database, userId: string, buddyId: string, now = Date.now()): Promise<boolean> {
	if (userId === buddyId) throw new DomainError('invalid', 'You cannot add yourself');
	const res = await db.insert(userBuddies).values({ userId, buddyId }).onConflictDoNothing().returning({ b: userBuddies.buddyId });
	if (res.length) {
		const me = (await db.select({ n: users.name }).from(users).where(eq(users.id, userId)).limit(1))[0];
		await notify(db, { userIds: [buddyId], type: 'friend_add', actorUserId: userId, payload: { actorName: me?.n }, now });
	}
	return res.length > 0;
}

export async function removeBuddy(db: Database, userId: string, buddyId: string): Promise<void> {
	await db.delete(userBuddies).where(and(eq(userBuddies.userId, userId), eq(userBuddies.buddyId, buddyId)));
}

export async function listBuddies(db: Database, userId: string) {
	const rows = await db.select({ b: userBuddies.buddyId }).from(userBuddies).where(eq(userBuddies.userId, userId));
	if (rows.length === 0) return [];
	return db
		.select({ id: users.id, name: users.name, avatar: users.avatar, email: users.email, licence: users.licence })
		.from(users)
		.where(inArray(users.id, rows.map((r) => r.b)))
		.orderBy(users.name);
}
