import { error } from '@sveltejs/kit';
import { and, eq, or } from 'drizzle-orm';
import { logbookJumps } from '#lib/server/db/schema.ts';
import { readFileBlob } from '#lib/server/domain/files.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import type { RequestHandler } from './$types';

/** A logbook sign-off signature: visible to the jumper whose jump it is and to the person who signed. */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Sign in');
	const uid = locals.user.id;
	const jump = (
		await locals.db
			.select({ id: logbookJumps.id })
			.from(logbookJumps)
			.where(and(eq(logbookJumps.signatureFileId, params.fileId), or(eq(logbookJumps.userId, uid), eq(logbookJumps.signerUserId, uid))))
			.limit(1)
	)[0];
	if (!jump) error(404, 'Not found');
	const blob = await readFileBlob(locals.db, await getStorage(), params.fileId);
	if (!blob || blob.row.purpose !== 'signature' || blob.row.mime !== 'image/png') error(404, 'Not found');
	return new Response(blob.data as BodyInit, {
		headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }
	});
};
