import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (fallback: string) => (value: string | undefined) => value || fallback;

/**
 * Runtime environment variables (SvelteKit 3 `defineEnvVars`).
 * Import values from `$app/env/private` on the server.
 */
export const variables = defineEnvVars({
	INSTANCE_MODE: {
		description:
			'"global" = hosted multi-dropzone instance (identity provider). "dropzone" = self-hosted single dropzone. Defaults by deploy target.',
		schema: (value) => {
			if (value === undefined || value === '') return undefined;
			if (value !== 'global' && value !== 'dropzone') {
				throw new Error(`INSTANCE_MODE must be "global" or "dropzone", got "${value}"`);
			}
			return value;
		}
	},
	APP_ORIGIN: {
		description: 'Public origin used in emails/links, e.g. https://dz.example.com',
		schema: optional('')
	},
	CANONICAL_HOST: {
		description:
			'Redirect every other hostname (e.g. log-book.io, www.log-book.app) to https://<this host> with a 301, keeping path and query. Unset = no redirect. Example: log-book.app',
		schema: optional('')
	},
	DATABASE_PATH: {
		description: 'Bun target only: path to the SQLite file.',
		schema: optional('data/app.db')
	},
	UPLOADS_DIR: {
		description: 'Bun target only: directory for uploaded files (photos, signatures, PDFs).',
		schema: optional('data/uploads')
	},
	SECRETS_KEY: {
		description:
			'Key (any long random string) used to encrypt stored payment-provider secrets (PayFast/Paystack/Yoco/Stripe keys). Unset = insecure dev key.',
		schema: optional('')
	},
	PAYMENTS_MOCK_URL: {
		description:
			'LOCAL TESTING ONLY: origin of `bun scripts/mock-payments.ts`; every payment provider call (PayFast, Paystack, Yoco, Stripe) goes there instead of the real provider. Never set in production.',
		schema: optional('')
	},
	STORAGE_DRIVER: {
		description:
			'Where uploaded files live: "disk" (UPLOADS_DIR, bun default), "db" (inside the database, Cloudflare default — no R2 needed) or "r2" (Cloudflare R2 binding FILES).',
		schema: optional('')
	},
	CRON_SECRET: {
		description:
			'Bearer secret for POST /api/cron (housekeeping + federation flush) when triggered from outside, e.g. host cron on a self-hosted box. Cloudflare cron triggers need no secret.',
		schema: optional('')
	},
	MIGRATIONS_DIR: {
		description: 'Bun target only: drizzle migrations folder applied on startup.',
		schema: optional('drizzle')
	},
	// ── Import / federation (docs/IMPORT.md) ──
	JUMPMASTER_FIREBASE_PROJECT_ID: {
		description: 'Jump Master connector: Firebase project id of the original app. Unset = connector unavailable.',
		schema: optional('')
	},
	JUMPMASTER_FIREBASE_API_KEY: {
		description: 'Jump Master connector: Firebase web API key of the original app.',
		schema: optional('')
	},
	JUMPMASTER_AUTH_BASE_URL: {
		description: 'Jump Master connector: override the Firebase Auth REST base URL (local mock only).',
		schema: optional('')
	},
	JUMPMASTER_FIRESTORE_BASE_URL: {
		description: 'Jump Master connector: override the Firestore REST base URL (local mock only).',
		schema: optional('')
	},
	FEDERATION_GLOBAL_URL: {
		description: 'Dropzone instances: origin of the global instance, e.g. https://log-book.app.',
		schema: optional('')
	},
	FEDERATION_CLIENT_ID: {
		description: 'Dropzone instances: OAuth client id issued by the global instance.',
		schema: optional('')
	},
	FEDERATION_CLIENT_SECRET: {
		description: 'Dropzone instances: OAuth client secret issued by the global instance.',
		schema: optional('')
	},
	FEDERATION_FLUSH_SECRET: {
		description: 'Bearer secret for POST /api/federation/flush (defaults to the client secret).',
		schema: optional('')
	}
});
