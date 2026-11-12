import { INSTANCE_MODE, APP_ORIGIN } from '$app/env/private';

export type InstanceMode = 'global' | 'dropzone';

/**
 * `global`   — the hosted instance; acts as identity provider for federation.
 * `dropzone` — a self-hosted dropzone instance; can link jumpers to global accounts.
 */
export function instanceMode(): InstanceMode {
	return INSTANCE_MODE ?? (__DEPLOY_TARGET__ === 'cloudflare' ? 'global' : 'dropzone');
}

export function publicOrigin(fallback: string): string {
	return APP_ORIGIN || fallback;
}
