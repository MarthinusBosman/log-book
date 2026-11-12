import { error } from '@sveltejs/kit';
import { getStorage } from '#lib/server/storage/index.ts';
import { readFileBlob } from '#lib/server/domain/files.ts';
import type { RequestHandler } from './$types';

/** Serves dropzone photos (public profile images) to signed-in users. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Sign in to view this file');
	const blob = await readFileBlob(locals.db, await getStorage(), params.id).catch(() => null);
	if (!blob || blob.row.purpose !== 'dz_photo') error(404, 'Photo not found');
	return new Response(blob.data as unknown as BodyInit, {
		headers: { 'Content-Type': blob.row.mime, 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' }
	});
};
