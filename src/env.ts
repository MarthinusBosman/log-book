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
	RESEND_API_KEY: {
		description:
			'Send email (password resets, invites, booking confirmations) through Resend with this API key. Unset = emails are only printed to the server log. On Cloudflare set it as a secret: wrangler secret put RESEND_API_KEY.',
		schema: optional('')
	},
	EMAIL_FROM: {
		description: 'Sender for outgoing email, e.g. "Skydive Example <noreply@your-dz.co.za>" (the domain must be verified in Resend). Default: Log-Book <noreply@log-book.app>.',
		schema: optional('')
	},
	EMAIL_REPLY_TO: {
		description: 'Optional Reply-To address for outgoing email. Unset = none.',
		schema: optional('')
	},
	GITHUB_FEEDBACK_TOKEN: {
		description:
			'In-app Feedback: a GitHub fine-grained token with Issues read/write on FEEDBACK_REPO. Feedback is posted there as PUBLIC issues. Unset = no Feedback button. On Cloudflare set it as a secret: wrangler secret put GITHUB_FEEDBACK_TOKEN.',
		schema: optional('')
	},
	FEEDBACK_REPO: {
		description: 'In-app Feedback: "owner/repo" that receives the issues. Default: the repo of brand.sourceUrl (MarthinusBosman/log-book).',
		schema: optional('')
	},
	FEEDBACK_API_BASE: {
		description: 'In-app Feedback: GitHub API origin. LOCAL TESTING ONLY (bun scripts/mock-github.ts); default https://api.github.com.',
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
		description: 'Jump Master connector: Firebase project id of the original app. Optional: discovered automatically from its public web app when unset.',
		schema: optional('')
	},
	JUMPMASTER_FIREBASE_API_KEY: {
		description: 'Jump Master connector: Firebase web API key of the original app.',
		schema: optional('')
	},
	JUMPMASTER_AUTODISCOVER: {
		description: "Jump Master connector: 'off' stops reading the original app's public web config automatically (then the two vars above are required).",
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
