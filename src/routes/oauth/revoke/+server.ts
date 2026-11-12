import { handleRevoke } from '#lib/server/import/federation/server.ts';
import { requireMode } from '#lib/server/import/federation/web.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	requireMode('global');
	return handleRevoke(locals.db, request);
};
