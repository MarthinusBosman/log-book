/**
 * Jump Master connector config, discovered automatically.
 *
 * The original web app (a Flutter build) ships its Firebase *web* config to every visitor's
 * browser inside `main.dart.js`: `initializeApp("<apiKey>", "<appId>", "<project>.firebaseapp.com", …)`.
 * That config is public by design (it only names the project; access is governed by the user's own
 * login and the original app's security rules), so instead of asking every instance owner to copy
 * it into env vars, we read it from the same public file the original app loads and cache it.
 *
 * Order: explicit env vars → cached discovery (7 days) → fresh discovery. `JUMPMASTER_AUTODISCOVER=off`
 * disables the fetch (connector then needs the env vars, as before).
 */
import type { Database } from '../../db/index.ts';
import { cacheGet, cachePut } from '../../memberships/cache.ts';

export const JUMPMASTER_APP_URL = 'https://jumpmaster.flutterflow.app';
const CACHE_KEY = 'jumpmaster:webconfig';
const TTL_OK = 7 * 24 * 3_600_000;
const TTL_MISS = 3_600_000; // retry discovery at most hourly after a failure

export type JumpMasterWebConfig = { projectId: string; apiKey: string };

/**
 * Pull the Firebase web config out of the original app's JS. dart2js emits FirebaseOptions as
 * positional strings: apiKey, appId (`1:<sender>:web:<hex>`), authDomain (`<project>.firebaseapp.com`).
 */
export function extractWebConfig(js: string): JumpMasterWebConfig | null {
	const re = /"(AIza[0-9A-Za-z_-]{30,})"\s*,\s*"\d+:\d+:web:[0-9a-f]+"\s*,\s*"([a-z0-9-]+)\.firebaseapp\.com"/;
	const m = re.exec(js);
	return m ? { apiKey: m[1], projectId: m[2] } : null;
}

export async function discoverWebConfig(
	db: Database,
	opts: { fetch?: typeof fetch; now?: number; appUrl?: string } = {}
): Promise<JumpMasterWebConfig | null> {
	const now = opts.now ?? Date.now();
	const cached = await cacheGet<JumpMasterWebConfig | { miss: true }>(db, CACHE_KEY, now);
	if (cached) return 'miss' in cached.value ? null : cached.value;

	const f = opts.fetch ?? fetch;
	let config: JumpMasterWebConfig | null = null;
	try {
		const res = await f(`${opts.appUrl ?? JUMPMASTER_APP_URL}/main.dart.js`, {
			headers: { 'User-Agent': 'Log-Book/1.0 (+https://log-book.app; Jump Master import)' }
		});
		if (res.ok) config = extractWebConfig(await res.text());
	} catch (e) {
		console.warn('[jumpmaster] config discovery failed', e);
	}
	await cachePut(db, CACHE_KEY, config ?? { miss: true }, config ? TTL_OK : TTL_MISS, now);
	return config;
}
