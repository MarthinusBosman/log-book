import { fail, redirect } from '@sveltejs/kit';
import { DZ_COOKIE, createDropzone, findDropzoneBySlug, slugify } from '#lib/server/dropzones/index.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals, cookies, url }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const country = String(form.get('country') ?? '').trim().toUpperCase() || null;
		const timezone = String(form.get('timezone') ?? 'UTC').trim() || 'UTC';
		const currency = String(form.get('currency') ?? 'USD').trim().toUpperCase() || 'USD';
		const values = { name, country, timezone, currency };

		if (name.length < 2) return fail(400, { ...values, message: 'Enter the dropzone name.' });
		const slug = slugify(name);
		if (!slug) return fail(400, { ...values, message: 'Name must contain letters or numbers.' });
		if (await findDropzoneBySlug(locals.db, slug)) {
			return fail(400, { ...values, message: 'A dropzone with that name already exists.' });
		}

		const dz = await createDropzone(locals.db, { name, slug, country, timezone, currency }, locals.user.id);
		cookies.set(DZ_COOKIE, dz.slug, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 365
		});
		redirect(303, '/app');
	}
};
