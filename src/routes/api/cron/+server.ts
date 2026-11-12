import { json } from '@sveltejs/kit';
import { cronAuthorized } from '#lib/server/cron.ts';
import { runScheduled } from '#lib/server/housekeeping.ts';
import type { RequestHandler } from './$types';

/**
 * Housekeeping (expired sessions/tokens, orphaned file blobs) + federation outbox flush on
 * dropzone instances. Triggered by the Cloudflare cron trigger (in-process) or
 * `curl -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $CRON_SECRET" <origin>/api/cron`.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!(await cronAuthorized(request))) return json({ error: 'unauthorized' }, { status: 401 });
	const result = await runScheduled(locals.db);
	console.info('[cron]', JSON.stringify(result));
	return json({ ok: true, ...result });
};
