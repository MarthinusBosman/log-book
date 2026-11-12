import { error, fail, redirect } from '@sveltejs/kit';
import { approveRedirect, denyRedirect, issueCode, validateAuthorize, SCOPES } from '#lib/server/import/federation/server.ts';
import { requireMode } from '#lib/server/import/federation/web.ts';
import type { Actions, PageServerLoad } from './$types';

const SCOPE_LABELS: Record<(typeof SCOPES)[number], string> = {
	openid: 'Know who you are on this site',
	profile: 'See your name, email, licence and association number',
	'logbook:write': 'Add jumps from their completed loads to your logbook'
};

export const load: PageServerLoad = async ({ url, locals }) => {
	requireMode('global');
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	const v = await validateAuthorize(locals.db, url.searchParams);
	if ('fatal' in v) error(400, v.fatal);
	if ('redirect' in v) redirect(303, v.redirect, { external: [new URL(v.redirect).origin] });
	const r = v.ok;
	return {
		client: { name: r.instance.name, origin: r.instance.origin },
		scopes: r.scope.map((s) => ({ id: s, label: SCOPE_LABELS[s as keyof typeof SCOPE_LABELS] ?? s })),
		params: url.search,
		user: { name: locals.user.name, email: locals.user.email }
	};
};

export const actions: Actions = {
	default: async ({ request, url, locals }) => {
		requireMode('global');
		if (!locals.user) redirect(303, '/login');
		const v = await validateAuthorize(locals.db, url.searchParams);
		if ('fatal' in v) return fail(400, { message: v.fatal });
		if ('redirect' in v) redirect(303, v.redirect, { external: [new URL(v.redirect).origin] });
		const ext = { external: [v.ok.instance.origin] };
		const form = await request.formData();
		if (form.get('decision') !== 'allow') redirect(303, denyRedirect(v.ok), ext);
		redirect(303, approveRedirect(v.ok, await issueCode(v.ok, locals.user.id)), ext);
	}
};
