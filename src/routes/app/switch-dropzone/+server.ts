import { error, redirect } from '@sveltejs/kit';
import { DZ_COOKIE, listMemberships } from '#lib/server/dropzones/index.ts';
import { safeRedirect } from '#lib/server/auth/redirect.ts';
import type { RequestHandler } from './$types';

/** Switch the active dropzone (stored in a cookie). Plain form POST — works without JS. */
export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
	if (!locals.user) redirect(303, '/login');
	const form = await request.formData();
	const slug = String(form.get('slug') ?? '');
	const memberships = await listMemberships(locals.db, locals.user.id);
	if (!memberships.some((m) => m.dropzone.slug === slug)) error(403, 'Not a member of that dropzone');

	cookies.set(DZ_COOKIE, slug, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 60 * 60 * 24 * 365
	});
	redirect(303, safeRedirect(String(form.get('redirectTo') ?? ''), '/app'));
};
