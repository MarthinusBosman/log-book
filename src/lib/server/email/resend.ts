/**
 * Resend driver (https://resend.com/docs/api-reference/emails/send-email). fetch only, so it runs
 * on Bun and on Workers. Email copy stays in our code (no provider templates) for self-hosters.
 */
import { brand } from '../../brand.ts';
import { ConsoleMailer, EmailError, type EmailMessage, type Mailer } from './types.ts';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export type ResendOptions = {
	apiKey: string;
	from: string;
	replyTo?: string | null;
	fetch?: FetchFn;
	/** Per attempt. */
	timeoutMs?: number;
	/** Total tries (network errors, 5xx and 429 only). */
	maxAttempts?: number;
	/** Backoff before try n+1 = baseDelayMs * 3^(n-1) (250 ms, 750 ms by default). */
	baseDelayMs?: number;
	/** A 429/5xx `retry-after` longer than this isn't waited for (give up instead). */
	maxRetryAfterMs?: number;
	/** Stop retrying once this much time has passed in one send() (keeps a Worker request short). */
	deadlineMs?: number;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** `retry-after` in seconds or an HTTP date → ms (null when absent/unparseable). */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
	if (!value) return null;
	const secs = Number(value);
	if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
	const at = Date.parse(value);
	return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export class ResendMailer implements Mailer {
	private readonly o: Required<Omit<ResendOptions, 'replyTo'>> & { replyTo: string | null };

	constructor(opts: ResendOptions) {
		if (!opts.apiKey) throw new Error('ResendMailer needs an API key');
		this.o = {
			fetch: (u: string, i: RequestInit) => fetch(u, i),
			timeoutMs: 5000,
			maxAttempts: 3,
			baseDelayMs: 250,
			maxRetryAfterMs: 2000,
			deadlineMs: 12_000,
			sleep: defaultSleep,
			now: () => Date.now(),
			...opts,
			replyTo: opts.replyTo || null
		};
	}

	async send(message: EmailMessage): Promise<void> {
		const o = this.o;
		const body: Record<string, unknown> = { from: o.from, to: [message.to], subject: message.subject, text: message.text };
		if (message.html) body.html = message.html;
		if (o.replyTo) body.reply_to = o.replyTo;
		const headers: Record<string, string> = {
			Authorization: `Bearer ${o.apiKey}`,
			'Content-Type': 'application/json',
			// Always sent: makes our own retries safe even when the caller has no natural key.
			'Idempotency-Key': (message.idempotencyKey || crypto.randomUUID()).slice(0, 256)
		};
		const json = JSON.stringify(body);
		const started = o.now();
		let last: EmailError | null = null;

		for (let attempt = 1; attempt <= o.maxAttempts; attempt++) {
			let retryAfter: number | null = null;
			try {
				const res = await o.fetch(RESEND_ENDPOINT, { method: 'POST', headers, body: json, signal: AbortSignal.timeout(o.timeoutMs) });
				if (res.ok) {
					const data = (await res.json().catch(() => ({}))) as { id?: string };
					console.info(`[email] resend accepted id=${data.id ?? '?'}${attempt > 1 ? ` after ${attempt} tries` : ''}`);
					return;
				}
				const detail = await res.text().catch(() => '');
				const retryable = res.status === 429 || res.status >= 500;
				last = new EmailError(`Resend ${res.status}: ${describe(detail)}`, res.status, retryable);
				if (!retryable) break;
				retryAfter = parseRetryAfter(res.headers.get('retry-after'), o.now());
				if (retryAfter !== null && retryAfter > o.maxRetryAfterMs) break;
			} catch (e) {
				const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
				last = new EmailError(`Resend ${timeout ? 'timed out' : 'unreachable'}: ${e instanceof Error ? e.message : String(e)}`, null, true);
			}
			if (attempt === o.maxAttempts) break;
			const wait = Math.max(retryAfter ?? 0, o.baseDelayMs * 3 ** (attempt - 1));
			if (o.now() - started + wait + o.timeoutMs > o.deadlineMs) break;
			await o.sleep(wait);
		}
		console.error(`[email] resend failed: ${last?.message}`);
		throw last ?? new EmailError('Resend failed');
	}
}

/** Resend's error body is `{ name, message, statusCode }`; keep logs short and free of the request. */
function describe(text: string): string {
	try {
		const j = JSON.parse(text) as { name?: string; message?: string };
		return [j.name, j.message].filter(Boolean).join(': ') || text.slice(0, 200);
	} catch {
		return text.slice(0, 200) || 'no body';
	}
}

export type MailerEnv = { RESEND_API_KEY?: string; EMAIL_FROM?: string; EMAIL_REPLY_TO?: string };

export const defaultFrom = () => `${brand.name} <noreply@${brand.domain}>`;

/** RESEND_API_KEY set → Resend, else the console (dev / self-hosters without email). */
export function mailerFromEnv(env: MailerEnv, extra: Partial<ResendOptions> = {}): Mailer {
	if (!env.RESEND_API_KEY) return new ConsoleMailer();
	return new ResendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM || defaultFrom(), replyTo: env.EMAIL_REPLY_TO || null, ...extra });
}
