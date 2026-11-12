import { handlePush } from '#lib/server/import/federation/server.ts';
import { requireMode } from '#lib/server/import/federation/web.ts';
import type { RequestHandler } from './$types';

/** Server-to-server logbook push from dropzone instances (HMAC-signed, see ARCHITECTURE.md). */
export const POST: RequestHandler = ({ request, locals }) => {
	requireMode('global');
	return handlePush(locals.db, request);
};
