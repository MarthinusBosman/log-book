import { metadata } from '#lib/server/import/federation/server.ts';
import { requireMode } from '#lib/server/import/federation/web.ts';
import { publicOrigin } from '#lib/server/config.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	requireMode('global');
	return Response.json(metadata(publicOrigin(url.origin)), { headers: { 'cache-control': 'public, max-age=300' } });
};
