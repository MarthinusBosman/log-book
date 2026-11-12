import { error, fail, redirect } from '@sveltejs/kit';
import { addTeamMember, deleteTeam, listBuddies, removeTeamMember, updateTeam } from '#lib/server/domain/teams.ts';
import { currentCheckin } from '#lib/server/domain/checkins.ts';
import { openLoadsToday } from '#lib/server/domain/loads.ts';
import { getPriceMap } from '#lib/server/domain/pricing.ts';
import { requestDropzone } from '#lib/server/request-cache.ts';
import { domainFail, opt, requireUser, str } from '#lib/server/jumper/forms.ts';
import { DISCIPLINES, TEAM_COLOURS, findJumpers, teamFor } from '#lib/server/jumper/teams.ts';
import { TEAM_JUMP_TYPES, priceTable } from '#lib/server/jumper/manifest.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireUser(locals, url);
	const { team, isOwner, canEdit } = await teamFor(locals.db, user.id, params.id);
	const q = url.searchParams.get('q')?.trim() ?? '';
	const memberIds = team.members.map((m) => m.id);
	const [buddies, results, checkin] = await Promise.all([
		listBuddies(locals.db, user.id),
		canEdit ? findJumpers(locals.db, q, memberIds) : Promise.resolve([]),
		currentCheckin(locals.db, user.id)
	]);
	let manifest = null;
	if (checkin) {
		const dz = await requestDropzone(locals, checkin.dropzone.id);
		if (!dz) error(404, 'Dropzone not found');
		const [loads, prices] = await Promise.all([openLoadsToday(locals.db, dz), getPriceMap(locals.db, dz.id)]);
		manifest = {
			dropzone: { name: checkin.dropzone.name, currency: dz.currency },
			loads: loads.filter((l) => l.isOpen).map((l) => ({ id: l.id, loadNumber: l.loadNumber, free: l.stats.free, aircraftName: l.aircraftName })),
			prices: priceTable(prices).base
		};
	}
	return {
		team: {
			id: team.id,
			name: team.name,
			discipline: team.discipline,
			colour: team.colour,
			coachUserId: team.coachUserId,
			videoUserId: team.videoUserId,
			dz: !!team.dropzoneId,
			members: team.members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, licence: m.licence, me: m.id === user.id }))
		},
		isOwner,
		canEdit,
		me: user.id,
		buddies: buddies.filter((b) => !memberIds.includes(b.id)).map((b) => ({ id: b.id, name: b.name, avatar: b.avatar, licence: b.licence })),
		q,
		results,
		manifest,
		jumpTypes: TEAM_JUMP_TYPES,
		disciplines: DISCIPLINES,
		colours: TEAM_COLOURS,
		created: url.searchParams.has('created')
	};
};

const editable = async (locals: App.Locals, userId: string, teamId: string) => {
	const t = await teamFor(locals.db, userId, teamId);
	if (!t.canEdit) return null;
	return t.team;
};

export const actions: Actions = {
	update: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const team = await editable(locals, user.id, params.id);
		if (!team) return fail(403, { action: 'update', message: 'Only the team owner can change the team.' });
		const form = await request.formData();
		const name = str(form, 'name');
		if (!name) return fail(400, { action: 'update', message: 'Team name is required' });
		const ids = new Set(team.members.map((m) => m.id));
		const pick = (k: string) => {
			const v = str(form, k);
			return v && ids.has(v) ? v : null;
		};
		const colour = str(form, 'colour');
		await updateTeam(locals.db, team.id, {
			name,
			discipline: opt(form, 'discipline'),
			colour: (TEAM_COLOURS as readonly string[]).includes(colour) ? colour : team.colour,
			coachUserId: pick('coachUserId'),
			videoUserId: pick('videoUserId')
		});
		return { action: 'update', success: 'Team updated' };
	},
	add: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const team = await editable(locals, user.id, params.id);
		if (!team) return fail(403, { action: 'add', message: 'Only the team owner can add members.' });
		try {
			await addTeamMember(locals.db, team.id, str(await request.formData(), 'userId'), { by: user.id });
		} catch (e) {
			return domainFail(e, { action: 'add' });
		}
		return { action: 'add', success: 'Added to team' };
	},
	remove: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const team = await editable(locals, user.id, params.id);
		if (!team) return fail(403, { action: 'remove', message: 'Only the team owner can remove members.' });
		const id = str(await request.formData(), 'userId');
		await removeTeamMember(locals.db, team.id, id);
		if (team.coachUserId === id) await updateTeam(locals.db, team.id, { coachUserId: null });
		if (team.videoUserId === id) await updateTeam(locals.db, team.id, { videoUserId: null });
		return { action: 'remove', success: 'Removed from team' };
	},
	leave: async ({ locals, params }) => {
		const user = requireUser(locals);
		const { team, isOwner } = await teamFor(locals.db, user.id, params.id);
		if (isOwner) return fail(400, { action: 'leave', message: 'You own this team. Delete it instead.' });
		await removeTeamMember(locals.db, team.id, user.id);
		redirect(303, '/app/team');
	},
	delete: async ({ locals, params }) => {
		const user = requireUser(locals);
		const team = await editable(locals, user.id, params.id);
		if (!team) return fail(403, { action: 'delete', message: 'Only the team owner can delete the team.' });
		await deleteTeam(locals.db, team.id);
		redirect(303, '/app/team');
	}
};
