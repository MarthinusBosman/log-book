import { redirect } from '@sveltejs/kit';
import { createRig } from '#lib/server/domain/gear.ts';
import { domainFail, requireUser } from '#lib/server/jumper/forms.ts';
import { gearContext, parseRigForm } from '#lib/server/jumper/gear.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = requireUser(locals, url);
	const { current } = await parent();
	return { ctx: await gearContext(locals.db, user.id, current?.dropzone.id) };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		let id: string;
		try {
			const ctx = await gearContext(locals.db, user.id, null);
			id = (await createRig(locals.db, { userId: user.id }, parseRigForm(form, ctx.exitWeightKg))).id;
		} catch (e) {
			return domainFail(e);
		}
		redirect(303, `/app/my-gear/${id}?added=1`);
	}
};
