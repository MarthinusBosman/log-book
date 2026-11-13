import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { users } from '#lib/server/db/schema.ts';
import { accountDeletionPreview, blockedMessage, deleteAccount } from '#lib/server/domain/account.ts';
import { verifyPassword } from '#lib/server/auth/password.ts';
import { normalizeEmail } from '#lib/server/auth/users.ts';
import { clearSessionCookie } from '#lib/server/auth/cookie.ts';
import { DZ_COOKIE } from '#lib/server/dropzones/index.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { domainFail, requireUser } from '#lib/server/jumper/forms.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);
	const preview = await accountDeletionPreview(locals.db, user.id);
	return { preview, blockedMessage: blockedMessage(preview) };
};

export const actions: Actions = {
	default: async ({ locals, request, cookies, url }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const me = (await locals.db.select({ email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1))[0];
		if (!me) redirect(303, '/');
		if (form.get('understand') !== 'on') return fail(400, { message: 'Tick the box to confirm you understand what is deleted and what is kept.' });
		if (me.passwordHash) {
			const ok = (await verifyPassword(me.passwordHash, String(form.get('password') ?? ''))).valid;
			if (!ok) return fail(400, { message: 'That password is incorrect.' });
		} else if (normalizeEmail(String(form.get('email') ?? '')) !== me.email) {
			return fail(400, { message: 'Type your email address exactly as shown to confirm.' });
		}
		try {
			await deleteAccount(locals.db, await getStorage(), user.id);
		} catch (e) {
			return domainFail(e);
		}
		const secure = url.protocol === 'https:';
		clearSessionCookie(cookies, secure);
		cookies.delete(DZ_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure });
		redirect(303, '/?deleted=1');
	}
};
