import { fail, redirect } from '@sveltejs/kit';
import { AuthError, resetPassword } from '#lib/server/auth/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	return { token: url.searchParams.get('token') ?? '' };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const password = String(form.get('password') ?? '');
		try {
			await resetPassword(locals.db, token, password);
		} catch (e) {
			if (e instanceof AuthError) return fail(400, { message: e.message });
			throw e;
		}
		redirect(303, '/login?reset=1');
	}
};
