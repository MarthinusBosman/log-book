import { error } from '@sveltejs/kit';
import { getStorage } from '#lib/server/storage/index.ts';
import { findDropzoneBySlug } from '#lib/server/dropzones/index.ts';
import { readLogo } from '#lib/server/branding.ts';
import { readBranding } from '#lib/branding.ts';
import type { RequestHandler } from './$types';

/**
 * Public dropzone logo (app shell, public pages, booking flow, display board). URLs carry
 * `?v=<fileId>`, so a matching request is cached for a year; a new upload gets a new URL.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const dz = await findDropzoneBySlug(locals.db, params.slug);
	if (!dz) error(404, 'Not found');
	const blob = await readLogo(locals.db, await getStorage(), dz);
	if (!blob || !blob.row.mime.startsWith('image/')) error(404, 'No logo');
	const immutable = url.searchParams.get('v') === readBranding(dz.settings).logoFileId;
	return new Response(blob.data as unknown as BodyInit, {
		headers: {
			'Content-Type': blob.row.mime,
			'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
