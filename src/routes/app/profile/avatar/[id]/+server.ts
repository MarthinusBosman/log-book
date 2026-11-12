import { error } from '@sveltejs/kit';
import { readFileBlob } from '#lib/server/domain/files.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import type { RequestHandler } from './$types';

/** Avatar images (any signed-in user may view avatars; nothing else is served here). */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Sign in');
	const blob = await readFileBlob(locals.db, await getStorage(), params.id);
	if (!blob || blob.row.purpose !== 'avatar') error(404, 'Not found');
	return new Response(blob.data as BodyInit, {
		headers: { 'content-type': blob.row.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }
	});
};
