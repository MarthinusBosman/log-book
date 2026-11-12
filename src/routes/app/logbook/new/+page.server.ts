import { redirect } from '@sveltejs/kit';
import { addJump, nextJumpNumber } from '#lib/server/domain/logbook.ts';
import { domainFail, requireUser, todayAt } from '#lib/server/jumper/forms.ts';
import { dropzoneOptions, parseJumpForm, rigOptions } from '#lib/server/jumper/logbook.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = requireUser(locals, url);
	const { current } = await parent();
	const [next, dropzones, rigs] = await Promise.all([nextJumpNumber(locals.db, user.id), dropzoneOptions(locals.db, user.id), rigOptions(locals.db, user.id)]);
	const activeRigs = rigs.filter((r) => r.active);
	return {
		dropzones,
		rigs,
		values: {
			jumpNumber: next,
			jumpDate: await todayAt(locals.db, current?.dropzone.id),
			dropzoneId: current && dropzones.some((d) => d.id === current.dropzone.id) ? current.dropzone.id : (dropzones[0]?.id ?? null),
			location: null,
			aircraft: null,
			altitudeFt: null,
			freefallSeconds: null,
			jumpType: null,
			description: null,
			rigId: activeRigs.length === 1 ? activeRigs[0].id : null
		}
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		let id: string;
		try {
			const allowed = new Set((await dropzoneOptions(locals.db, user.id)).map((d) => d.id));
			const input = parseJumpForm(form, allowed);
			if (input.rigId && !(await rigOptions(locals.db, user.id)).some((r) => r.id === input.rigId)) input.rigId = null;
			id = (await addJump(locals.db, user.id, input)).id;
		} catch (e) {
			return domainFail(e);
		}
		redirect(303, `/app/logbook/${id}?added=1`);
	}
};
