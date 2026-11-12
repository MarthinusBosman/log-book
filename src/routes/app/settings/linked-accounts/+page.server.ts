import { error, fail, redirect } from '@sveltejs/kit';
import { and, count, eq, isNull } from 'drizzle-orm';
import { federationOutbox } from '#lib/server/db/schema.ts';
import { instanceMode, publicOrigin } from '#lib/server/config.ts';
import { listGrants, revokeGrant } from '#lib/server/import/federation/server.ts';
import { CALLBACK_PATH, LINK_COOKIE, localLink, startLink, unlink } from '#lib/server/import/federation/client.ts';
import { fedConfig } from '#lib/server/import/federation/web.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const mode = instanceMode();
	if (mode === 'global') return { mode, grants: await listGrants(locals.db, locals.user.id) };
	const cfg = await fedConfig(locals.db);
	const link = await localLink(locals.db, locals.user.id);
	const [pending] = await locals.db
		.select({ n: count() })
		.from(federationOutbox)
		.where(and(eq(federationOutbox.userId, locals.user.id), isNull(federationOutbox.sentAt)));
	return {
		mode,
		available: !!cfg,
		globalUrl: cfg?.globalUrl ?? null,
		link: link ? { subject: link.subject, issuer: link.issuer, linkedAt: link.linkedAt, lastSyncAt: link.lastSyncAt } : null,
		pending: pending.n,
		flash: url.searchParams.get('linked') ? 'linked' : null,
		error: url.searchParams.get('error')
	};
};

export const actions: Actions = {
	link: async ({ locals, cookies, url }) => {
		if (!locals.user) redirect(303, '/login');
		if (instanceMode() !== 'dropzone') error(404);
		const cfg = await fedConfig(locals.db);
		if (!cfg) return fail(400, { message: 'This dropzone has not connected to a global instance yet.' });
		const { url: target, cookie } = await startLink(cfg, publicOrigin(url.origin) + CALLBACK_PATH);
		cookies.set(LINK_COOKIE, cookie, { path: '/app/settings/linked-accounts', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 600 });
		redirect(303, target, { external: [new URL(cfg.globalUrl).origin] });
	},
	unlink: async ({ locals }) => {
		if (!locals.user) redirect(303, '/login');
		await unlink(locals.db, await fedConfig(locals.db), locals.user.id);
		return { done: 'Global account unlinked.' };
	},
	revoke: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		if (instanceMode() !== 'global') error(404);
		const form = await request.formData();
		await revokeGrant(locals.db, locals.user.id, String(form.get('grant') ?? ''));
		return { done: 'Dropzone unlinked. It can no longer add jumps to your logbook.' };
	}
};
