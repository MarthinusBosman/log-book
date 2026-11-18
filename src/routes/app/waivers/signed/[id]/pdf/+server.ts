import { error, redirect } from '@sveltejs/kit';
import { getSignature } from '#lib/server/domain/indemnity.ts';
import { canAny } from '#lib/server/domain/permissions.ts';
import { localDate } from '#lib/server/domain/time.ts';
import { requestDropzone } from '#lib/server/request-cache.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { sportWaiverPdf, tandemPdf } from '#lib/server/tandems/documents.ts';
import { pdfResponse } from '#lib/server/tandems/http.ts';
import type { RequestHandler } from './$types';

/** Signed waiver PDF: the signer themselves, or staff at that dropzone. */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = locals.user;
	if (!user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	const sig = await getSignature(locals.db, params.id);
	if (!sig) error(404, 'Signed waiver not found');
	const allowed = sig.userId === user.id || (await canAny(locals.db, user, sig.dropzoneId, ['indemnity.manage', 'tandems.manage', 'checkin.manage']));
	if (!allowed) error(404, 'Signed waiver not found');
	const storage = await getStorage();
	const bytes = sig.tandemPassengerId ? await tandemPdf(locals.db, storage, sig.tandemPassengerId) : await sportWaiverPdf(locals.db, storage, sig.id);
	const dz = await requestDropzone(locals, sig.dropzoneId);
	const name = `waiver-${sig.audience}-${sig.signerName}-${localDate(sig.signedAt, dz?.timezone)}.pdf`;
	return pdfResponse(bytes, name, url.searchParams.get('download') !== '1');
};
