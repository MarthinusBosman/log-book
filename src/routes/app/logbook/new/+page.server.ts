import { redirect } from '@sveltejs/kit';
import { addJump, nextJumpNumber } from '#lib/server/domain/logbook.ts';
import { domainFail, requireUser, todayAt } from '#lib/server/jumper/forms.ts';
import { aircraftOptions, dropzoneOptions, jumpFormDefaults, jumpFormEcho, parseJumpForm, rigOptions } from '#lib/server/jumper/logbook.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = requireUser(locals, url);
	const { current } = await parent();
	const [next, [dropzones, planes], rigs] = await Promise.all([
		nextJumpNumber(locals.db, user.id),
		dropzoneOptions(locals, user.id).then(async (dzs) => [dzs, await aircraftOptions(locals.db, user.id, dzs.map((d) => d.id))] as const),
		rigOptions(locals.db, user.id)
	]);
	const activeRigs = rigs.filter((r) => r.active).map((r) => r.id);
	const [defaults, jumpDate] = await Promise.all([
		jumpFormDefaults(locals.db, user.id, dropzones.map((d) => d.id), activeRigs),
		todayAt(locals, current?.dropzone.id)
	]);
	const dropzoneId = current && dropzones.some((d) => d.id === current.dropzone.id) ? current.dropzone.id : (dropzones[0]?.id ?? null);
	const atDz = defaults.byDz[dropzoneId ?? ''];
	return {
		dropzones,
		planes,
		rigs,
		/** Per-dropzone aircraft + altitude, swapped in when the jumper picks another dropzone. */
		dzDefaults: defaults.byDz,
		values: {
			jumpNumber: next,
			jumpDate,
			dropzoneId,
			location: dropzoneId ? null : (atDz?.location ?? null),
			aircraft: atDz?.aircraft ?? null,
			altitudeFt: atDz?.altitudeFt ?? null,
			freefallSeconds: null,
			jumpType: defaults.jumpType,
			description: null,
			rigId: defaults.rigId
		}
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		let id: string;
		try {
			const allowed = new Set((await dropzoneOptions(locals, user.id)).map((d) => d.id));
			const input = parseJumpForm(form, allowed);
			if (input.rigId && !(await rigOptions(locals.db, user.id)).some((r) => r.id === input.rigId)) input.rigId = null;
			id = (await addJump(locals.db, user.id, input)).id;
		} catch (e) {
			return domainFail(e, { values: jumpFormEcho(form) });
		}
		redirect(303, `/app/logbook/${id}?added=1`);
	}
};
