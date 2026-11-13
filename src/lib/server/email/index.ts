/**
 * Outbound email. `getMailer()` picks the driver from the environment on first use:
 * RESEND_API_KEY set → Resend (resend.ts), otherwise the console (dev, self-hosters without email).
 * Callers must treat `send()` failures as non-fatal where the action itself succeeded.
 */
import { mailerFromEnv } from './resend.ts';
import { isPlaceholderEmail, type EmailMessage, type Mailer } from './types.ts';

export { ConsoleMailer, EmailError, isPlaceholderEmail, type EmailMessage, type Mailer } from './types.ts';

let mailer: Mailer | null = null;
let fromEnv: Promise<Mailer> | null = null;

/**
 * The env is read on the first send (dynamic import), so modules that merely import this file
 * still load in unit tests, where `$app/env/private` doesn't exist.
 */
const envMailer: Mailer = {
	async send(message: EmailMessage) {
		fromEnv ??= import('$app/env/private').then((env) =>
			mailerFromEnv({ RESEND_API_KEY: env.RESEND_API_KEY, EMAIL_FROM: env.EMAIL_FROM, EMAIL_REPLY_TO: env.EMAIL_REPLY_TO })
		);
		return (await fromEnv).send(message);
	}
};

/** Skips placeholder (`.invalid`) recipients: they bounce and hurt the sending domain's reputation. */
const guarded: Mailer = {
	async send(message: EmailMessage) {
		if (isPlaceholderEmail(message.to)) {
			console.info('[email] skipped: placeholder recipient');
			return;
		}
		return (mailer ?? envMailer).send(message);
	}
};

export function getMailer(): Mailer {
	return guarded;
}

/** For tests / alternate providers. */
export function setMailer(m: Mailer | null): void {
	mailer = m;
}

/**
 * Stable idempotency key derived from a secret (e.g. a reset token) without exposing it:
 * `<kind>/<sha256 hex>`.
 */
export async function idempotencyKey(kind: string, secret: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`email:${kind}:${secret}`));
	return `${kind}/${[...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
