import { connectorConfig, confirmAction, discardAction, importContext, importPageData, pruneStaged, uploadAction } from '#lib/server/import/web.ts';
import type { Actions, PageServerLoad } from './$types';

const BASE = '/app/import';

export const load: PageServerLoad = async (event) => {
	const ctx = await importContext(event, 'jumper');
	const user = event.locals.user!;
	if (!event.url.search) await pruneStaged(event.locals.db, user.id);
	return { ...(await importPageData(event.locals.db, user.id, ctx, event.url)), connector: await connectorConfig() };
};

export const actions: Actions = {
	upload: async (event) => uploadAction(event, await importContext(event, 'jumper'), BASE),
	confirm: async (event) => confirmAction(event, await importContext(event, 'jumper'), BASE),
	discard: async (event) => {
		await importContext(event, 'jumper');
		return discardAction(event, BASE);
	}
};
