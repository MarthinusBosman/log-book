import { redirect } from '@sveltejs/kit';
import { addBuddy, createTeam, listBuddies, listUserTeams, removeBuddy } from '#lib/server/domain/teams.ts';
import { domainFail, opt, requireUser, str } from '#lib/server/jumper/forms.ts';
import { DISCIPLINES, TEAM_COLOURS, findJumpers } from '#lib/server/jumper/teams.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);
	const q = url.searchParams.get('q')?.trim() ?? '';
	const [teams, buddies] = await Promise.all([listUserTeams(locals.db, user.id), listBuddies(locals.db, user.id)]);
	return {
		me: user.id,
		teams: teams
			.map((t) => ({
				id: t.id,
				name: t.name,
				discipline: t.discipline,
				colour: t.colour,
				mine: t.ownerUserId === user.id,
				dz: !!t.dropzoneId,
				members: t.members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar })),
				coach: t.members.find((m) => m.id === t.coachUserId)?.name ?? (t.coachUserId ? 'Coach' : null)
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
		buddies: buddies.map((b) => ({ id: b.id, name: b.name, avatar: b.avatar, licence: b.licence })),
		q,
		results: await findJumpers(locals.db, q, [user.id, ...buddies.map((b) => b.id)]),
		disciplines: DISCIPLINES,
		colours: TEAM_COLOURS
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		let id: string;
		try {
			const colour = str(form, 'colour');
			const team = await createTeam(
				locals.db,
				{ userId: user.id },
				{ name: str(form, 'name'), discipline: opt(form, 'discipline'), colour: (TEAM_COLOURS as readonly string[]).includes(colour) ? colour : null, memberIds: [user.id] },
				{ by: user.id }
			);
			id = team.id;
		} catch (e) {
			return domainFail(e, { action: 'create' });
		}
		redirect(303, `/app/team/${id}?created=1`);
	},
	buddy: async ({ locals, request }) => {
		const user = requireUser(locals);
		try {
			await addBuddy(locals.db, user.id, str(await request.formData(), 'userId'));
		} catch (e) {
			return domainFail(e, { action: 'buddy' });
		}
		return { action: 'buddy', success: 'Added to your jump buddies' };
	},
	unbuddy: async ({ locals, request }) => {
		const user = requireUser(locals);
		await removeBuddy(locals.db, user.id, str(await request.formData(), 'userId'));
		return { action: 'unbuddy', success: 'Removed from your jump buddies' };
	}
};
