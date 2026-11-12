import { handleUserinfo } from '#lib/server/import/federation/server.ts';
import { requireMode } from '#lib/server/import/federation/web.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, locals }) => {
	requireMode('global');
	return handleUserinfo(locals.db, request);
};
