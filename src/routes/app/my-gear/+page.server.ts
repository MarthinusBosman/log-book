import { listUserRigs } from '#lib/server/domain/gear.ts';
import { requireUser } from '#lib/server/jumper/forms.ts';
import { gearContext, rigView } from '#lib/server/jumper/gear.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = requireUser(locals, url);
	const { current } = await parent();
	const [ctx, rigs] = await Promise.all([gearContext(locals.db, user.id, current?.dropzone.id), listUserRigs(locals.db, user.id)]);
	const views = rigs.map((r) => rigView(r, ctx));
	return { ctx, active: views.filter((r) => r.active), retired: views.filter((r) => !r.active) };
};
