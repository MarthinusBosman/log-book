import { error } from '@sveltejs/kit';
import { readFileBlob } from '#lib/server/domain/files.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { publicDropzone } from '#lib/server/tandems/public.ts';
import type { RequestHandler } from './$types';

/** Public dropzone photo. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const dz = await publicDropzone(locals.db, params.slug);
	if (!dz.photoFileId) error(404, 'No photo');
	const blob = await readFileBlob(locals.db, await getStorage(), dz.photoFileId).catch(() => null);
	if (!blob || !blob.row.mime.startsWith('image/')) error(404, 'No photo');
	return new Response(blob.data as unknown as BodyInit, {
		headers: { 'Content-Type': blob.row.mime, 'Cache-Control': 'public, max-age=300' }
	});
};
