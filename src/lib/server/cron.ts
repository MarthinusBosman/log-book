/**
 * Auth for POST /api/cron.
 *
 * Cloudflare: the cron trigger runs `scheduled()` in the same isolate (see scripts/cf-postbuild.ts),
 * which stores a fresh random token on `globalThis` and calls the app's fetch handler in-process
 * with it — nothing leaves the Worker and no secret has to be configured.
 * Anywhere: `Authorization: Bearer $CRON_SECRET` (e.g. host cron on a self-hosted box).
 */
import { safeEqual } from './import/federation/crypto.ts';

export const CRON_TOKEN_HEADER = 'x-dz-cron-token';
const GLOBAL_KEY = '__DZ_CRON_TOKEN__';

export async function cronAuthorized(request: Request): Promise<boolean> {
	const internal = (globalThis as Record<string, unknown>)[GLOBAL_KEY];
	const got = request.headers.get(CRON_TOKEN_HEADER);
	if (typeof internal === 'string' && internal && got && safeEqual(got, internal)) return true;
	const { CRON_SECRET } = await import('$app/env/private');
	const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
	return !!CRON_SECRET && !!bearer && safeEqual(bearer, CRON_SECRET);
}
