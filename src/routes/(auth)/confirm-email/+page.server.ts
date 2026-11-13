import { fail } from '@sveltejs/kit';
import { brand } from '#lib/brand.ts';
import { confirmEmailChange, peekEmailChange } from '#lib/server/auth/email-change.ts';
import { getMailer, idempotencyKey } from '#lib/server/email/index.ts';
import { isDomainError } from '#lib/server/domain/errors.ts';
import type { Actions, PageServerLoad } from './$types';

// GET only shows the address: link scanners in mail clients prefetch GETs, so the change needs a POST.
export const load: PageServerLoad = async ({ locals, url }) => {
	const token = url.searchParams.get('token') ?? '';
	const pending = token ? await peekEmailChange(locals.db, token) : null;
	return { token, newEmail: pending?.newEmail ?? null, signedIn: !!locals.user };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const token = String((await request.formData()).get('token') ?? '');
		let done: Awaited<ReturnType<typeof confirmEmailChange>>;
		try {
			done = await confirmEmailChange(locals.db, token);
		} catch (e) {
			if (isDomainError(e)) return fail(400, { message: e.message });
			throw e;
		}
		try {
			// Heads-up to the old address: if this wasn't the owner, they know where to turn.
			await getMailer().send({
				to: done.oldEmail,
				subject: `Your ${brand.name} email was changed`,
				text: `Hi ${done.name},\n\nYour ${brand.name} sign-in email was changed from ${done.oldEmail} to ${done.newEmail}.\n\nIf you didn't do this, reply to this email or write to ${brand.privacyEmail}.`,
				idempotencyKey: await idempotencyKey('email-changed', token)
			});
		} catch (e) {
			console.error('[email-change] notice to old address not sent', e instanceof Error ? e.message : e);
		}
		return { done: true, newEmail: done.newEmail };
	}
};
