import { fail } from '@sveltejs/kit';
import { brand } from '#lib/brand.ts';
import { publicOrigin } from '#lib/server/config.ts';
import { getMailer } from '#lib/server/email/index.ts';
import { createPasswordResetToken, findUserByEmail, validateEmail, normalizeEmail } from '#lib/server/auth/users.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const email = normalizeEmail(String((await request.formData()).get('email') ?? ''));
		const err = validateEmail(email);
		if (err) return fail(400, { email, message: err });

		const user = await findUserByEmail(locals.db, email);
		if (user) {
			const token = await createPasswordResetToken(locals.db, user.id);
			const link = `${publicOrigin(url.origin)}/reset-password?token=${token}`;
			await getMailer().send({
				to: user.email,
				subject: `Reset your ${brand.name} password`,
				text: `Hi ${user.name},\n\nReset your password (valid for 1 hour):\n${link}\n\nIf you didn't ask for this, ignore this email.`
			});
		}
		// Same response either way — don't reveal which emails have accounts.
		return { sent: true, email };
	}
};
