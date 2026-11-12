import { error } from '@sveltejs/kit';
import { displayData, publicDisplayDropzone } from '#lib/server/manifest/display.ts';
import type { PageServerLoad } from './$types';

/** Public hangar TV board: no login, guarded by the per-dropzone display token. */
export const load: PageServerLoad = async (event) => {
	event.depends('manifest:display');
	event.setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
	const dz = await publicDisplayDropzone(event.locals.db, event.params.slug, event.url.searchParams.get('token'));
	if (!dz) error(404, 'This display link is not valid. Ask the dropzone for a new one.');
	return displayData(event.locals.db, dz, null);
};
