import { error } from '@sveltejs/kit';
import { findByConfirmation } from '#lib/server/domain/tandems.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { tandemPdf } from '#lib/server/tandems/documents.ts';
import { pdfResponse } from '#lib/server/tandems/http.ts';
import { publicDropzone } from '#lib/server/tandems/public.ts';
import type { RequestHandler } from './$types';

/** Customer download of the tandem confirmation / signed indemnity PDF (confirmation number = access). */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const dz = await publicDropzone(locals.db, params.slug);
	const p = await findByConfirmation(locals.db, params.conf.toUpperCase());
	if (!p || p.dropzoneId !== dz.id) error(404, 'Booking not found');
	const storage = await getStorage();
	const bytes = await tandemPdf(locals.db, storage, p.id);
	return pdfResponse(bytes, `tandem-${p.confirmationNumber}.pdf`, url.searchParams.get('download') !== '1');
};
