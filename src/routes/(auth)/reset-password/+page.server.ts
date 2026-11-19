import { fail, redirect } from '@sveltejs/kit';
import { isPlaceholderName } from '#lib/greeting.ts';
import { createSession, generateSessionToken } from '#lib/server/auth/session.ts';
import { setSessionCookie } from '#lib/server/auth/cookie.ts';
import { AuthError, passwordResetTokenInfo, resetPassword } from '#lib/server/auth/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const token = url.searchParams.get('token') ?? '';
	// Checked up front so a used or expired link says so before anyone types a password, and an
	// invitee (no password yet) sees "Set your password" instead of reset wording.
	const info = await passwordResetTokenInfo(locals.db, token);
	return {
		token,
		valid: !!info,
		firstPassword: info?.firstPassword ?? false,
		email: info?.email ?? '',
		// Invitees confirm (or give) their name here. Staff often invite with just an email, which
		// leaves the address's local part ("pete.pilot") as a placeholder: start that one empty.
		name: info?.firstPassword && !isPlaceholderName(info.name, info.email) ? info.name : ''
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const password = String(form.get('password') ?? '');
		const info = await passwordResetTokenInfo(locals.db, token);
		const name = info?.firstPassword ? String(form.get('name') ?? '') : undefined;
		let userId: string;
		try {
			userId = await resetPassword(locals.db, token, password, Date.now(), { name });
		} catch (e) {
			if (e instanceof AuthError) return fail(400, { message: e.message, field: e.field ?? null, name: name ?? '' });
			throw e;
		}
		if (!info?.firstPassword) redirect(303, '/login?reset=1');
		// An invitee just proved they own the address: sign them straight in instead of asking
		// for the password they typed a second ago.
		const sessionToken = generateSessionToken();
		const session = await createSession(locals.db, sessionToken, userId, {
			userAgent: request.headers.get('user-agent'),
			ip: getClientAddress()
		});
		setSessionCookie(cookies, sessionToken, session.expiresAt, url.protocol === 'https:');
		redirect(303, '/app');
	}
};
