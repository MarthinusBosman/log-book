import { error, redirect } from '@sveltejs/kit';
import { getDropzone } from '#lib/server/domain/dropzone-admin.ts';
import { isSignatureValid, listSections, listSignatures, signatureExpiresAt } from '#lib/server/domain/indemnity.ts';
import { isDomainError } from '#lib/server/domain/errors.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { readAnswerFields, signSportWaiver } from '#lib/server/tandems/documents.ts';
import { failFrom, str } from '#lib/server/tandems/http.ts';
import type { Actions, PageServerLoad } from './$types';

async function dropzoneOr404(db: App.Locals['db'], id: string) {
	try {
		return await getDropzone(db, id);
	} catch (e) {
		if (isDomainError(e, 'not_found')) error(404, 'Dropzone not found');
		throw e;
	}
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = locals.user;
	if (!user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	const dz = await dropzoneOr404(locals.db, params.dzId);
	const [sections, mine] = await Promise.all([listSections(locals.db, dz.id, 'sport'), listSignatures(locals.db, dz.id, { audience: 'sport', userId: user.id, limit: 20 })]);
	const latest = mine[0];
	return {
		dz: { id: dz.id, name: dz.name, slug: dz.slug, active: dz.indemnitySportActive },
		me: { name: user.name, email: user.email },
		sections: sections.map((s) => ({ title: s.title, content: s.content, type: s.type })),
		status: latest
			? { valid: isSignatureValid(latest), signedAt: latest.signedAt, expiresAt: signatureExpiresAt(latest), id: latest.id }
			: null,
		history: mine.map((s) => ({ id: s.id, signedAt: s.signedAt, valid: isSignatureValid(s) }))
	};
};

export const actions: Actions = {
	sign: async ({ locals, params, request }) => {
		const user = locals.user;
		if (!user) redirect(303, '/login');
		const dz = await dropzoneOr404(locals.db, params.dzId);
		const form = await request.formData();
		const sections = await listSections(locals.db, dz.id, 'sport');
		try {
			const sig = await signSportWaiver(locals.db, await getStorage(), {
				dropzoneId: dz.id,
				userId: user.id,
				signerName: str(form, 'signer_name') || user.name,
				signature: str(form, 'signature'),
				answers: readAnswerFields(form, sections.length)
			});
			return { ok: true, signed: sig.id, message: 'Waiver signed — thank you!' };
		} catch (e) {
			const section = isDomainError(e) ? (e.details as { section?: number } | undefined)?.section : undefined;
			return failFrom(e, { section: section ?? null });
		}
	}
};
