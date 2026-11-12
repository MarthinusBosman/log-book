/**
 * Runs after `vite build` for the Cloudflare target (part of `bun run build:cf`).
 *
 * adapter-cloudflare v8 emits a Worker with only a `fetch` handler. We wrap it so the Worker also
 * exports `scheduled()` for the cron trigger in wrangler.jsonc: the handler mints a random
 * per-invocation token on globalThis and calls the app's own fetch handler in-process with
 * `POST /api/cron` (housekeeping + federation flush). No secret, no network hop.
 *
 *   .svelte-kit/cloudflare/_worker.js      ← this wrapper (wrangler `main`)
 *   .svelte-kit/cloudflare/_app_worker.js  ← the adapter's original worker
 */
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = '.svelte-kit/cloudflare';
const main = join(dir, '_worker.js');
const inner = join(dir, '_app_worker.js');
const MARK = '// dz:scheduled-wrapper';

if (!existsSync(main)) throw new Error(`${main} not found — run the Cloudflare build first`);
if (readFileSync(main, 'utf8').startsWith(MARK)) {
	console.info('[cf-postbuild] already wrapped');
	process.exit(0);
}
renameSync(main, inner);
writeFileSync(
	main,
	`${MARK}
import app from './_app_worker.js';

export default {
	fetch: (req, env, ctx) => app.fetch(req, env, ctx),
	async scheduled(controller, env, ctx) {
		const token = crypto.randomUUID();
		globalThis.__DZ_CRON_TOKEN__ = token;
		const origin = (env.APP_ORIGIN || 'https://cron.invalid').replace(/\\/$/, '');
		const req = new Request(origin + '/api/cron', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-dz-cron-token': token },
			body: JSON.stringify({ cron: controller.cron, scheduledTime: controller.scheduledTime })
		});
		const run = (async () => {
			try {
				const res = await app.fetch(req, env, ctx);
				const text = await res.text();
				if (!res.ok) throw new Error('/api/cron ' + res.status + ': ' + text.slice(0, 500));
				console.log('[scheduled]', controller.cron, text);
			} finally {
				if (globalThis.__DZ_CRON_TOKEN__ === token) globalThis.__DZ_CRON_TOKEN__ = undefined;
			}
		})();
		ctx.waitUntil(run);
		await run;
	}
};
`
);
// The worker lives inside the assets directory: never upload it as a public static file.
appendFileSync(join(dir, '.assetsignore'), '\n_app_worker.js\n');
console.info('[cf-postbuild] wrapped worker with scheduled() handler');
