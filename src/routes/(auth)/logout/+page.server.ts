import { redirect } from '@sveltejs/kit';
import { invalidateSession } from '#lib/server/auth/session.ts';
import { clearSessionCookie } from '#lib/server/auth/cookie.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
};

/** Logout is POST-only (a GET logout link could be triggered cross-site). */
export const actions: Actions = {
	default: async ({ locals, cookies, url }) => {
		if (locals.session) await invalidateSession(locals.db, locals.session.id);
		clearSessionCookie(cookies, url.protocol === 'https:');
		redirect(303, '/login');
	}
};
