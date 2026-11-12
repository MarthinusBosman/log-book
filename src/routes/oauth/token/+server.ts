import { handleToken } from '#lib/server/import/federation/server.ts';
import { requireMode } from '#lib/server/import/federation/web.ts';
import type { RequestHandler } from './$types';

/** OAuth token endpoint. Send JSON (or form-encoded with an Origin header — SvelteKit's CSRF guard). */
export const POST: RequestHandler = ({ request, locals }) => {
	requireMode('global');
	return handleToken(locals.db, request);
};
