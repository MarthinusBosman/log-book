import { redirect } from '@sveltejs/kit';
import { publicOrigin } from '#lib/server/config.ts';
import { CALLBACK_PATH, FederationError, finishLink, flushOutbox, LINK_COOKIE } from '#lib/server/import/federation/client.ts';
import { fedConfig, requireMode } from '#lib/server/import/federation/web.ts';
import type { RequestHandler } from './$types';

const BACK = '/app/settings/linked-accounts';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	requireMode('dropzone');
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	const cfg = await fedConfig(locals.db);
	if (!cfg) redirect(303, `${BACK}?error=${encodeURIComponent('Federation is not configured.')}`);
	const cookie = cookies.get(LINK_COOKIE);
	cookies.delete(LINK_COOKIE, { path: BACK });
	try {
		await finishLink(locals.db, cfg, locals.user.id, {
			code: url.searchParams.get('code'),
			state: url.searchParams.get('state'),
			error: url.searchParams.get('error'),
			cookie,
			redirectUri: publicOrigin(url.origin) + CALLBACK_PATH
		});
	} catch (e) {
		if (e instanceof FederationError) redirect(303, `${BACK}?error=${encodeURIComponent(e.message)}`);
		throw e;
	}
	// Push the backfilled jumps right away (in the background on Bun).
	const run = flushOutbox(locals.db, cfg).catch(() => null);
	if (__DEPLOY_TARGET__ === 'cloudflare') await run;
	redirect(303, `${BACK}?linked=1`);
};
