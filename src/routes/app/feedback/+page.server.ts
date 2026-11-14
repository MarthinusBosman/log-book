import { error, fail, redirect } from '@sveltejs/kit';
import { SECRETS_KEY } from '$app/env/private';
import { FEEDBACK_TYPES, type FeedbackType } from '#lib/feedback.ts';
import { findSubmission, lookupReporter, pagePath, submitFeedback } from '#lib/server/feedback/index.ts';
import { serverFeedbackConfig } from '#lib/server/feedback/config.ts';
import { currentMembership } from '#lib/server/request-cache.ts';
import { requireUser } from '#lib/server/jumper/forms.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);
	if (!serverFeedbackConfig()) error(404, 'Not found');
	const sent = Number(url.searchParams.get('sent'));
	const issue = Number.isInteger(sent) && sent > 0 ? await findSubmission(locals.db, user.id, sent) : undefined;
	const type = url.searchParams.get('type');
	// Super admins can map an issue's anonymous reporter reference back to the account.
	const superAdmin = !!user.isSuperAdmin;
	const ref = superAdmin ? (url.searchParams.get('ref') ?? '').trim() : '';
	return {
		admin: superAdmin ? { ref, match: ref ? await lookupReporter(locals.db, ref) : null } : null,
		from: pagePath(url.searchParams.get('from')),
		type: (FEEDBACK_TYPES as readonly string[]).includes(type ?? '') ? (type as FeedbackType) : null,
		sent: issue?.number && issue.url ? { number: issue.number, url: issue.url } : null,
		scrubbed: url.searchParams.get('scrubbed') === '1'
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireUser(event.locals);
		const cfg = serverFeedbackConfig();
		if (!cfg) error(404, 'Not found');
		const f = await event.request.formData();
		const type = String(f.get('type') ?? '');
		const message = String(f.get('message') ?? '');
		const includePage = f.get('include_page') === 'on';
		const from = pagePath(String(f.get('from') ?? ''));
		const current = await currentMembership(event, user.id);

		const result = await submitFeedback(
			event.locals.db,
			cfg,
			{
				userId: user.id,
				type,
				message,
				page: includePage ? from : null,
				userAgent: event.request.headers.get('user-agent'),
				roles: current?.roles ?? [],
				version: __APP_VERSION__
			},
			{ secret: SECRETS_KEY }
		);
		if (!result.ok) {
			const status = result.code === 'invalid' ? 400 : result.code === 'github' ? 502 : result.code === 'disabled' ? 404 : 429;
			return fail(status, { message: result.message, values: { type, message, includePage } });
		}
		redirect(303, `/app/feedback?sent=${result.number}${result.scrubbed ? '&scrubbed=1' : ''}`);
	}
};
