/// <reference types="bun" />

// Minimal typing for the Workers runtime module. We deliberately don't pull the
// full @cloudflare/workers-types globals into the project (they clash with DOM lib).
declare module 'cloudflare:workers' {
	export const env: Record<string, unknown>;
}
