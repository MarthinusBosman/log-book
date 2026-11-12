import { json } from '@sveltejs/kit';
import { flushOutbox } from '#lib/server/import/federation/client.ts';
import { fedConfig, flushAuthorized, requireMode } from '#lib/server/import/federation/web.ts';
import type { RequestHandler } from './$types';

/**
 * Push due outbox rows now (cron / manual). `Authorization: Bearer <FEDERATION_FLUSH_SECRET>`
 * (defaults to the client secret). Send `Content-Type: application/json` — SvelteKit's CSRF guard
 * rejects body-less/form POSTs without a same-origin Origin header.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	requireMode('dropzone');
	const cfg = await fedConfig(locals.db);
	if (!cfg) return json({ error: 'not_configured' }, { status: 503 });
	if (!(await flushAuthorized(request, cfg))) return json({ error: 'unauthorized' }, { status: 401 });
	return json(await flushOutbox(locals.db, cfg));
};
