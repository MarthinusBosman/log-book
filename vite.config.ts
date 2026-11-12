import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * One codebase, two deploy targets — chosen at build time:
 *   DEPLOY_TARGET=bun        → adapter-node output, run with `bun build/index.js` (self-hosted, bun:sqlite)
 *   DEPLOY_TARGET=cloudflare → adapter-cloudflare output (hosted, D1)
 */
const target = (process.env.DEPLOY_TARGET ?? 'bun') as 'bun' | 'cloudflare';
if (target !== 'bun' && target !== 'cloudflare') {
	throw new Error(`Unknown DEPLOY_TARGET "${target}" (expected "bun" or "cloudflare")`);
}

/** `<package.json version>+<git sha>` (GIT_SHA env wins, e.g. in Docker builds without .git). */
function appVersion(): string {
	const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
	let sha = process.env.GIT_SHA?.slice(0, 7) ?? '';
	if (!sha) {
		try {
			sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
		} catch {
			/* not a git checkout */
		}
	}
	return sha ? `${pkg.version}+${sha}` : pkg.version;
}

async function loadAdapter() {
	if (target === 'cloudflare') {
		const { default: adapter } = await import('@sveltejs/adapter-cloudflare');
		return adapter();
	}
	const { default: adapter } = await import('@sveltejs/adapter-node');
	return adapter({ out: 'build', precompress: true });
}

/** Fail the Cloudflare build loudly if anything drags bun:sqlite into the worker bundle. */
function forbidBunInWorker(): Plugin {
	return {
		name: 'dz:forbid-bun-in-worker',
		apply: 'build',
		resolveId(id) {
			if (target === 'cloudflare' && id.startsWith('bun:')) {
				throw new Error(`"${id}" must not be imported in the Cloudflare build`);
			}
		}
	};
}

export default defineConfig({
	define: {
		__DEPLOY_TARGET__: JSON.stringify(target),
		__APP_VERSION__: JSON.stringify(appVersion())
	},
	plugins: [
		forbidBunInWorker(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: await loadAdapter(),
			// Kit's origin check is replaced by the `csrf` handle in hooks.server.ts (same rule, but
			// payment-provider webhooks under /api/payments/ may post form data cross-site: PayFast ITN).
			csrf: { trustedOrigins: ['*'] },
			// Content-Security-Policy header on every SSR page; SvelteKit adds a per-request nonce to
			// script-src for its inline hydration script. Other security headers: src/hooks.server.ts.
			// (No form-action: OAuth consent posts redirect to the linking dropzone's own origin.)
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Svelte/Tailwind use style attributes; nonces would disable 'unsafe-inline'.
					'style-src': ['self', 'unsafe-inline'],
					// data:/blob: = signature pads, QR codes and upload previews; https: = imported avatars.
					'img-src': ['self', 'data:', 'blob:', 'https:'],
					'font-src': ['self', 'data:'],
					'connect-src': ['self'],
					'frame-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'frame-ancestors': ['self'],
					'manifest-src': ['self'],
					'worker-src': ['self']
				}
			}
		})
	],
	ssr: {
		external: ['bun:sqlite']
	}
});
