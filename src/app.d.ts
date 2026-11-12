// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Database } from '#lib/server/db/index.ts';
import type { SessionValidationResult } from '#lib/server/auth/session.ts';

declare global {
	/** Injected by Vite `define` at build time — see vite.config.ts. */
	const __DEPLOY_TARGET__: 'bun' | 'cloudflare';
	/** package.json version + short git sha at build time, e.g. `0.0.1+abc1234`. */
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			db: Database;
			user: SessionValidationResult['user'];
			session: SessionValidationResult['session'];
			/** Theme the page renders with (cookie, else a dropzone default on /dz pages). */
			theme: import('#lib/theme.ts').PageTheme;
			/** Per-request read cache (GET/HEAD only), see #lib/server/request-cache.ts. */
			cache?: Map<string, Promise<unknown>>;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
