import { fail, redirect } from '@sveltejs/kit';
import { createSession, generateSessionToken } from '#lib/server/auth/session.ts';
import { setSessionCookie } from '#lib/server/auth/cookie.ts';
import { authenticate } from '#lib/server/auth/users.ts';
import { safeRedirect } from '#lib/server/auth/redirect.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { email, message: 'Enter your email and password.' });
		}
		const user = await authenticate(locals.db, email, password);
		if (!user) {
			return fail(400, { email, message: 'Incorrect email or password.' });
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
