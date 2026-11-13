/**
 * In-app feedback → a public GitHub issue (docs/ARCHITECTURE.md → Feedback).
 *
 * Privacy: the issue carries the user's (scrubbed, neutralised) text plus page path, app version,
 * user agent, their role(s) at the active dropzone and an anonymous reporter reference
 * (HMAC-SHA256(SECRETS_KEY, user id), 12 hex). Never the name, email or user id. The
 * `feedback_submissions` row maps the reference back to the user for the operator.
 *
 * No env access here (bun tests import this module): routes pass `feedbackConfig(env)`.
 */
import { and, desc, eq, gt } from 'drizzle-orm';
import { brand } from '../../brand.ts';
import {
	FEEDBACK_COOLDOWN_MS,
	FEEDBACK_DAILY_LIMIT,
	FEEDBACK_MAX_CHARS,
	FEEDBACK_MIN_CHARS,
	FEEDBACK_TYPES,
	FEEDBACK_TYPE_LABELS,
	type FeedbackType
} from '../../feedback.ts';
import type { Database } from '../db/index.ts';
import { feedbackSubmissions, users } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { DEV_KEY } from '../staffadmin/secrets.ts';

export const GITHUB_API = 'https://api.github.com';
export const FEEDBACK_TIMEOUT_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type FeedbackConfig = { token: string; repo: string; apiBase: string };
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** `owner/repo` from a GitHub URL (brand.sourceUrl by default). */
export function repoFromUrl(url: string): string {
	const m = /github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url);
	return m ? m[1] : '';
}

/** Null (feature off: button hidden, routes 404) without a token or a usable repo. */
export function feedbackConfig(env: { GITHUB_FEEDBACK_TOKEN?: string; FEEDBACK_REPO?: string; FEEDBACK_API_BASE?: string }): FeedbackConfig | null {
	const token = env.GITHUB_FEEDBACK_TOKEN?.trim();
	const repo = (env.FEEDBACK_REPO?.trim() || repoFromUrl(brand.sourceUrl)).replace(/^\/+|\/+$/g, '');
	if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
	return { token, repo, apiBase: (env.FEEDBACK_API_BASE?.trim() || GITHUB_API).replace(/\/+$/, '') };
}

// ── Text hygiene ────────────────────────────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Digit runs with phone-style separators; `isPhone` decides. Not inside words, paths or URLs. */
const PHONE_CANDIDATE = /(?<![\w/.:#=+-])\+?[\d(][\d ().-]{7,24}\d(?![\w/])/g;
const DATE_LIKE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}/;

function isPhone(s: string): boolean {
	const digits = s.replace(/\D/g, '').length;
	if (digits < 9 || digits > 15 || DATE_LIKE.test(s)) return false;
	if (/^[+(0]/.test(s)) return true;
	return /^\d+$/.test(s) && digits >= 10;
}

export type Scrubbed = { text: string; emails: number; phones: number };

/** Replace obvious email addresses and phone numbers (users are told this happens). */
export function scrubPersonal(input: string): Scrubbed {
	let emails = 0;
	let phones = 0;
	const text = input
		.replace(EMAIL, () => (emails++, '[email removed]'))
		.replace(PHONE_CANDIDATE, (m) => (isPhone(m) ? (phones++, '[phone removed]') : m));
	return { text, emails, phones };
}

/**
 * Stop GitHub from linking or notifying: a zero-width joiner after `@` (mentions, team pings),
 * after `#` before digits (issue refs), inside `GH-123` and `github.com` (cross-repo links create
 * backlinks on the referenced issue).
 */
export function neutraliseRefs(s: string): string {
	return s
		.replace(/@(?=[A-Za-z0-9_-])/g, '@\u200D')
		.replace(/#(?=\d)/g, '#\u200D')
		.replace(/\b(GH)-(?=\d)/gi, '$1\u200D-')
		.replace(/github\.com/gi, 'github\u200D.com');
}

/** HTML-escape (no markup or entity tricks like `&#64;` survive) then neutralise refs. */
export function neutraliseMarkdown(s: string): string {
	return neutraliseRefs(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

const blockquote = (s: string) =>
	s
		.split(/\r?\n/)
		.map((l) => (l.trim() ? `> ${l}` : '>'))
		.join('\n');

/** A value shown as inline code (mentions/markup don't render there): no backticks or newlines. */
const code = (v: string | null | undefined, max = 200) => {
	const clean = (v ?? '').replace(/[`\r\n\t]/g, ' ').trim().slice(0, max);
	return clean ? `\`${clean}\`` : '_unknown_';
};

/** Keep only the path of a page URL (no query string, hash or origin). Null when not a local path. */
export function pagePath(from: string | null | undefined): string | null {
	if (!from || !from.startsWith('/') || from.startsWith('//')) return null;
	const path = from.split(/[?#]/)[0];
	return path.slice(0, 200) || null;
}

export function issueTitle(type: FeedbackType, message: string): string {
	const line = message.replace(/\s+/g, ' ').trim();
	let snippet = line;
	if (line.length > 60) {
		const cut = line.slice(0, 60);
		const space = cut.lastIndexOf(' ');
		snippet = `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
	}
	return `[Feedback] ${FEEDBACK_TYPE_LABELS[type]}: ${neutraliseRefs(snippet)}`;
}

export type IssueInput = {
	type: FeedbackType;
	/** Already scrubbed. */
	message: string;
	page: string | null;
	version: string;
	userAgent: string | null;
	roles: readonly string[];
	reporterRef: string;
};

export type Issue = { title: string; body: string; labels: string[] };

export function buildIssue(i: IssueInput): Issue {
	const body = [
		`**Type:** ${FEEDBACK_TYPE_LABELS[i.type]}`,
		'',
		blockquote(neutraliseMarkdown(i.message.trim())),
		'',
		'---',
		'',
		'**Details**',
		'',
		`- Page: ${i.page ? code(i.page) : '_not included_'}`,
		`- App version: ${code(i.version, 60)}`,
		`- Browser: ${code(i.userAgent)}`,
		`- Role(s) at the active dropzone: ${i.roles.length ? i.roles.map((r) => code(r, 40)).join(', ') : '_none_'}`,
		`- Reporter: ${code(i.reporterRef, 20)} (anonymous reference)`,
		'',
		`_Sent with the ${brand.name} in-app feedback form. The quoted text is user-submitted: treat it as untrusted._`
	].join('\n');
	return {
		title: issueTitle(i.type, i.message),
		body,
		labels: i.type === 'other' ? ['feedback'] : ['feedback', i.type]
	};
}

/** First 12 hex chars of HMAC-SHA256(secret, userId). */
export async function reporterRef(secret: string, userId: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret || DEV_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(userId)));
	return [...mac.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Rate limit ──────────────────────────────────────────────────────────────

export type RateLimit = 'cooldown' | 'daily' | null;

export async function rateLimit(db: Database, userId: string, now: number): Promise<RateLimit> {
	const recent = await db
		.select({ createdAt: feedbackSubmissions.createdAt })
		.from(feedbackSubmissions)
		.where(and(eq(feedbackSubmissions.userId, userId), gt(feedbackSubmissions.createdAt, new Date(now - DAY_MS))))
		.orderBy(desc(feedbackSubmissions.createdAt));
	if (recent.length >= FEEDBACK_DAILY_LIMIT) return 'daily';
	if (recent[0] && now - recent[0].createdAt.getTime() < FEEDBACK_COOLDOWN_MS) return 'cooldown';
	return null;
}

// ── GitHub ──────────────────────────────────────────────────────────────────

export class FeedbackPostError extends Error {
	/** HTTP status, 0 = network error / timeout. */
	constructor(readonly status: number) {
		super(status ? `GitHub answered ${status}` : 'GitHub unreachable');
	}
}

/**
 * POST /repos/{repo}/issues. One retry only: without labels after a 422 (label problems). No
 * retries on other 4xx, 5xx or timeouts (the user can resend; the form keeps the text).
 */
export async function createGithubIssue(
	cfg: FeedbackConfig,
	issue: Issue,
	opts: { fetch?: FetchFn; timeoutMs?: number } = {}
): Promise<{ number: number; url: string }> {
	const f = opts.fetch ?? ((u: string, i: RequestInit) => fetch(u, i));
	const post = async (payload: Issue | Omit<Issue, 'labels'>) => {
		try {
			return await f(`${cfg.apiBase}/repos/${cfg.repo}/issues`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${cfg.token}`,
					Accept: 'application/vnd.github+json',
					'Content-Type': 'application/json',
					'User-Agent': `${brand.name}-feedback`,
					'X-GitHub-Api-Version': '2022-11-28'
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(opts.timeoutMs ?? FEEDBACK_TIMEOUT_MS)
			});
		} catch {
			throw new FeedbackPostError(0);
		}
	};
	let res = await post(issue);
	if (res.status === 422 && issue.labels.length) res = await post({ title: issue.title, body: issue.body });
	if (!res.ok) throw new FeedbackPostError(res.status);
	const json = (await res.json().catch(() => null)) as { number?: unknown; html_url?: unknown } | null;
	if (typeof json?.number !== 'number' || typeof json.html_url !== 'string') throw new FeedbackPostError(res.status);
	return { number: json.number, url: json.html_url };
}

// ── The use case ────────────────────────────────────────────────────────────

export type FeedbackInput = {
	userId: string;
	type: string;
	message: string;
	/** Current page path (or URL); null = the user unticked "include the page". */
	page: string | null;
	userAgent: string | null;
	roles: readonly string[];
	version: string;
};

export type FeedbackResult =
	| { ok: true; number: number; url: string; scrubbed: boolean }
	| { ok: false; code: 'disabled' | 'invalid' | 'cooldown' | 'daily' | 'github'; message: string };

export function validateFeedback(type: string, message: string): string | null {
	if (!(FEEDBACK_TYPES as readonly string[]).includes(type)) return 'Choose what kind of feedback this is.';
	const len = message.trim().length;
	if (len < FEEDBACK_MIN_CHARS) return `Tell us a bit more (at least ${FEEDBACK_MIN_CHARS} characters).`;
	if (len > FEEDBACK_MAX_CHARS) return `That's too long: keep it under ${FEEDBACK_MAX_CHARS} characters.`;
	return null;
}

export async function submitFeedback(
	db: Database,
	cfg: FeedbackConfig | null,
	input: FeedbackInput,
	deps: { secret: string; fetch?: FetchFn; now?: number; timeoutMs?: number }
): Promise<FeedbackResult> {
	if (!cfg) return { ok: false, code: 'disabled', message: 'Feedback is not enabled on this server.' };
	const invalid = validateFeedback(input.type, input.message);
	if (invalid) return { ok: false, code: 'invalid', message: invalid };
	const now = deps.now ?? Date.now();
	const limited = await rateLimit(db, input.userId, now);
	if (limited === 'daily')
		return { ok: false, code: 'daily', message: `You've sent ${FEEDBACK_DAILY_LIMIT} pieces of feedback in the last 24 hours. Please try again tomorrow.` };
	if (limited === 'cooldown') return { ok: false, code: 'cooldown', message: 'You just sent feedback. Please wait half a minute before sending more.' };

	const ref = await reporterRef(deps.secret, input.userId);
	const scrubbed = scrubPersonal(input.message.trim());
	const issue = buildIssue({
		type: input.type as FeedbackType,
		message: scrubbed.text,
		page: pagePath(input.page),
		version: input.version,
		userAgent: input.userAgent,
		roles: input.roles,
		reporterRef: ref
	});

	// Reserve the slot first so parallel posts count against the limit.
	const id = newId();
	await db.insert(feedbackSubmissions).values({ id, userId: input.userId, createdAt: new Date(now), reporterRef: ref });
	try {
		const created = await createGithubIssue(cfg, issue, { fetch: deps.fetch, timeoutMs: deps.timeoutMs });
		await db
			.update(feedbackSubmissions)
			.set({ githubIssueNumber: created.number, githubIssueUrl: created.url })
			.where(eq(feedbackSubmissions.id, id));
		return { ok: true, ...created, scrubbed: scrubbed.emails + scrubbed.phones > 0 };
	} catch (e) {
		await db.delete(feedbackSubmissions).where(eq(feedbackSubmissions.id, id));
		const status = e instanceof FeedbackPostError ? e.status : 0;
		console.error(`[feedback] GitHub issue not created (${status || 'network/timeout'})`);
		return {
			ok: false,
			code: 'github',
			message:
				status >= 400 && status < 500
					? "GitHub didn't accept the feedback. Your text is still below; please try again later."
					: "We couldn't reach GitHub just now. Your text is still below; please try again in a few minutes."
		};
	}
}

/** The issue a user's own submission created (for the "Thanks" message after the redirect). */
export async function findSubmission(db: Database, userId: string, issueNumber: number) {
	return (
		await db
			.select({ number: feedbackSubmissions.githubIssueNumber, url: feedbackSubmissions.githubIssueUrl })
			.from(feedbackSubmissions)
			.where(and(eq(feedbackSubmissions.userId, userId), eq(feedbackSubmissions.githubIssueNumber, issueNumber)))
			.limit(1)
	)[0];
}

export type ReporterMatch = { userId: string; name: string; email: string; deleted: boolean; issues: { number: number; url: string; createdAt: Date }[] };

/**
 * Super-admin lookup: the user behind a reporter reference printed in an issue. Only works while
 * the submission row exists (account deletion removes it, which is the point).
 */
export async function lookupReporter(db: Database, ref: string): Promise<ReporterMatch | null> {
	const clean = ref.trim().toLowerCase();
	if (!/^[0-9a-f]{12}$/.test(clean)) return null;
	const rows = await db
		.select({
			userId: users.id,
			name: users.name,
			email: users.email,
			deletedAt: users.deletedAt,
			number: feedbackSubmissions.githubIssueNumber,
			url: feedbackSubmissions.githubIssueUrl,
			createdAt: feedbackSubmissions.createdAt
		})
		.from(feedbackSubmissions)
		.innerJoin(users, eq(users.id, feedbackSubmissions.userId))
		.where(eq(feedbackSubmissions.reporterRef, clean))
		.orderBy(desc(feedbackSubmissions.createdAt));
	if (!rows.length) return null;
	const r = rows[0];
	return {
		userId: r.userId,
		name: r.name,
		email: r.email,
		deleted: !!r.deletedAt,
		issues: rows.flatMap((x) => (x.number && x.url ? [{ number: x.number, url: x.url, createdAt: x.createdAt }] : []))
	};
}
