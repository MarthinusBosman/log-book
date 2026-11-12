import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { instanceMode } from '#lib/server/config.ts';
import type { RequestHandler } from './$types';

/**
 * Liveness + DB check (Docker healthcheck, uptime monitors). 200 when the database answers,
 * 503 otherwise. Never cached.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const started = Date.now();
	let db: { ok: true; latencyMs: number } | { ok: false; error: string };
	try {
		await locals.db.run(sql`select 1`);
		db = { ok: true, latencyMs: Date.now() - started };
	} catch (e) {
		db = { ok: false, error: e instanceof Error ? e.message : 'unavailable' };
	}
	return json(
		{ ok: db.ok, version: __APP_VERSION__, target: __DEPLOY_TARGET__, mode: instanceMode(), db },
		{ status: db.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } }
	);
};
