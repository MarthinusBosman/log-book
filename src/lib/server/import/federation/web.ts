/** Route glue for federation pages and endpoints (reads env, enforces instance mode). */
import { error, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index.ts';
import { dropzoneMemberRoles, users } from '../../db/schema.ts';
import { instanceMode } from '../../config.ts';
import { rolesCan } from '../../domain/permissions.ts';
import { hasDueOutbox } from '../../domain/federation.ts';
import { flushOutbox, resolveConfig, type FedConfig } from './client.ts';
import { safeEqual } from './crypto.ts';

export async function fedConfig(db: Database): Promise<FedConfig | null> {
	const env = await import('$app/env/private');
	return resolveConfig(db, env);
}

export function requireMode(mode: 'global' | 'dropzone') {
	if (instanceMode() !== mode) error(404, 'Not found');
}

/** Owners/admins of any dropzone here (or super admins) manage federation settings. */
export async function canManageFederation(db: Database, userId: string): Promise<boolean> {
	const u = (await db.select({ su: users.isSuperAdmin }).from(users).where(eq(users.id, userId)).limit(1))[0];
	if (u?.su) return true;
	const rows = await db.select({ role: dropzoneMemberRoles.role }).from(dropzoneMemberRoles).where(eq(dropzoneMemberRoles.userId, userId));
	return rolesCan(
		rows.map((r) => r.role),
		'dz.settings'
	);
}

/** Bearer check for /api/federation/flush: FEDERATION_FLUSH_SECRET, else the client secret. */
export async function flushAuthorized(request: Request, cfg: FedConfig): Promise<boolean> {
	const { FEDERATION_FLUSH_SECRET } = await import('$app/env/private');
	const expected = FEDERATION_FLUSH_SECRET || cfg.clientSecret;
	const got = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
	return !!got && safeEqual(got, expected);
}

/**
 * Opportunistic flush after a mutating /app request on a dropzone instance (e.g. completing a
 * load): one indexed query when nothing is due. Runs after the response on Bun; awaited on
 * Workers (no waitUntil through adapter v8).
 */
export async function afterMutation(event: RequestEvent): Promise<void> {
	if (event.request.method !== 'POST' || !event.url.pathname.startsWith('/app')) return;
	if (instanceMode() !== 'dropzone') return;
	const db = event.locals.db;
	try {
		if (!(await hasDueOutbox(db))) return;
		const cfg = await fedConfig(db);
		if (!cfg) return;
		const run = flushOutbox(db, cfg).catch((e) => console.warn('[federation] flush failed', e));
		if (__DEPLOY_TARGET__ === 'cloudflare') await run;
	} catch (e) {
		console.warn('[federation] flush check failed', e);
	}
}
