import { fail, redirect } from '@sveltejs/kit';
import { eq, or } from 'drizzle-orm';
import { teams as teamsTable, users } from '#lib/server/db/schema.ts';
import { createTeam, listDropzoneTeams } from '#lib/server/domain/teams.ts';
import { DISCIPLINES, TEAM_COLOURS, TEAM_COLOUR_OPTIONS } from '#lib/server/jumper/teams.ts';
import { optStr, requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'teams.manage');
	const db = event.locals.db;
	const [teams, staff] = await Promise.all([
		listDropzoneTeams(db, ctx.dz.id),
		// coach / video names (they're often not members); a join, so no bound-parameter list
		db
			.selectDistinct({ id: users.id, name: users.name })
			.from(teamsTable)
			.innerJoin(users, or(eq(users.id, teamsTable.coachUserId), eq(users.id, teamsTable.videoUserId)))
			.where(eq(teamsTable.dropzoneId, ctx.dz.id))
	]);
	const names = new Map(staff.map((s) => [s.id, s.name]));
	const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
	return {
		teams: teams.map((t) => ({
			id: t.id,
			name: t.name,
			discipline: t.discipline,
			colour: t.colour,
			coach: name(t.coachUserId),
			video: name(t.videoUserId),
			members: t.members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }))
		})),
		disciplines: DISCIPLINES,
		colours: TEAM_COLOUR_OPTIONS
	};
};

export const actions: Actions = {
	create: async (event) => {
		const res = await runAction(event, 'teams.manage', async ({ dz, user }) => {
			const f = await event.request.formData();
			const name = str(f, 'name');
			if (!name) return fail(400, { action: 'create', message: 'Enter a team name.' });
			const colour = str(f, 'colour');
			const team = await createTeam(
				event.locals.db,
				{ dropzoneId: dz.id },
				{ name, discipline: optStr(f, 'discipline'), colour: (TEAM_COLOURS as readonly string[]).includes(colour) ? colour : null },
				{ by: user.id }
			);
			return { id: team.id };
		});
		if (res && 'id' in res) redirect(303, `/app/team/${res.id}?created=1`);
		return res;
	}
};
