import { fail, redirect } from '@sveltejs/kit';
import { createSession, generateSessionToken } from '#lib/server/auth/session.ts';
import { setSessionCookie } from '#lib/server/auth/cookie.ts';
import { AuthError, createUser } from '#lib/server/auth/users.ts';
import { safeRedirect } from '#lib/server/auth/redirect.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');

		let user;
		try {
			user = await createUser(locals.db, { name, email, password });
		} catch (e) {
			if (e instanceof AuthError) {
				return fail(400, { name, email, field: e.field ?? null, message: e.message });
			}
			throw e;
		}

		const token = generateSessionToken();
		const session = await createSession(locals.db, token, user.id, {
			userAgent: request.headers.get('user-agent'),
			ip: getClientAddress()
		});
		setSessionCookie(cookies, token, session.expiresAt, url.protocol === 'https:');
		redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	}
};
