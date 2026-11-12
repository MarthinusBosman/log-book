import { error } from '@sveltejs/kit';
import { getPassenger } from '#lib/server/domain/tandems.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { tandemPdf } from '#lib/server/tandems/documents.ts';
import { pdfResponse, staffContext } from '#lib/server/tandems/http.ts';
import type { RequestHandler } from './$types';

/** Staff download: rendered on demand (PDFs aren't stored; see documents.ts). */
export const GET: RequestHandler = async (event) => {
	const { dz } = await staffContext(event, 'tandems.manage');
	const p = await getPassenger(event.locals.db, event.params.id);
	if (!p || p.dropzoneId !== dz.id) error(404, 'Tandem booking not found');
	const storage = await getStorage();
	const bytes = await tandemPdf(event.locals.db, storage, p.id);
	return pdfResponse(bytes, `tandem-${p.confirmationNumber}.pdf`, event.url.searchParams.get('download') !== '1');
};
