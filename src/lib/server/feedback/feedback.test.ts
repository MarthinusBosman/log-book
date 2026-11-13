import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { NOW, freshDb, makeUser } from '../domain/testing.ts';
import { feedbackSubmissions } from '../db/schema.ts';
import {
	FeedbackPostError,
	buildIssue,
	createGithubIssue,
	feedbackConfig,
	issueTitle,
	neutraliseMarkdown,
	pagePath,
	lookupReporter,
	rateLimit,
	reporterRef,
	repoFromUrl,
	scrubPersonal,
	submitFeedback,
	type FeedbackConfig,
	type FetchFn
} from './index.ts';

const ZWJ = '\u200D';
const CFG: FeedbackConfig = { token: 'test-token', repo: 'owner/repo', apiBase: 'http://github.test' };

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

/** Records calls; answers with `responses` in order (last one repeats). Never touches the network. */
function stubFetch(...responses: (() => Response)[]) {
	const calls: Call[] = [];
	const fn: FetchFn = async (url, init) => {
		calls.push({ url, init, body: JSON.parse(String(init.body)) });
		return responses[Math.min(calls.length - 1, responses.length - 1)]();
	};
	return { fn, calls };
}
const created = (n = 42) => () => Response.json({ number: n, html_url: `https://github.com/owner/repo/issues/${n}` }, { status: 201 });
const status = (s: number) => () => Response.json({ message: 'nope' }, { status: s });

const input = (userId: string, patch: Partial<Parameters<typeof submitFeedback>[2]> = {}) => ({
	userId,
	type: 'bug',
	message: 'The manifest board froze after load 3.',
	page: '/app/manifest?day=2026-11-14#x',
	userAgent: 'Mozilla/5.0 (Test)',
	roles: ['jumper', 'coach'],
	version: 'abc1234',
	...patch
});

describe('feedback config', () => {
	test('disabled without a token; repo defaults to brand.sourceUrl', () => {
		expect(feedbackConfig({})).toBeNull();
		expect(feedbackConfig({ GITHUB_FEEDBACK_TOKEN: '  ' })).toBeNull();
		expect(feedbackConfig({ GITHUB_FEEDBACK_TOKEN: 't' })).toEqual({ token: 't', repo: 'MarthinusBosman/log-book', apiBase: 'https://api.github.com' });
		expect(feedbackConfig({ GITHUB_FEEDBACK_TOKEN: 't', FEEDBACK_REPO: 'me/fork', FEEDBACK_API_BASE: 'http://localhost:9/' })).toEqual({
			token: 't',
			repo: 'me/fork',
			apiBase: 'http://localhost:9'
		});
		expect(feedbackConfig({ GITHUB_FEEDBACK_TOKEN: 't', FEEDBACK_REPO: 'not a repo' })).toBeNull();
		expect(repoFromUrl('https://github.com/a/b.git')).toBe('a/b');
	});

	test('submitFeedback refuses when disabled and never calls fetch', async () => {
		const db = freshDb();
		const u = await makeUser(db);
		const { fn, calls } = stubFetch(created());
		const r = await submitFeedback(db, null, input(u.id), { secret: 's', fetch: fn, now: NOW });
		expect(r).toMatchObject({ ok: false, code: 'disabled' });
		expect(calls).toHaveLength(0);
	});
});

describe('feedback text hygiene', () => {
	test('scrubs emails and phone numbers, leaves dates, times and small numbers', () => {
		const s = scrubPersonal(
			'Mail me at jane.doe+dz@example.co.za or call 082 123 4567 / +27 82 123 4567 / (555) 123-4567 / 0821234567. ' +
				'Load 12 on 2026-11-14 10:30 at 13500 ft, jump #1234, id 550e8400-e29b-41d4-a716-446655440000.'
		);
		expect(s.emails).toBe(1);
		expect(s.phones).toBe(4);
		expect(s.text).not.toContain('jane.doe');
		expect(s.text).not.toMatch(/123 4567|1234567/);
		expect(s.text).toContain('[email removed]');
		expect(s.text).toContain('[phone removed]');
		expect(s.text).toContain('2026-11-14 10:30');
		expect(s.text).toContain('13500 ft');
		expect(s.text).toContain('550e8400-e29b-41d4-a716-446655440000');
	});

	test('neutralises mentions, issue refs, HTML and entities', () => {
		const out = neutraliseMarkdown('Hey @octocat and @org/team, see #12, GH-3, owner/repo#4 and https://github.com/a/b/issues/1 <img src=x onerror=alert(1)> &#64;sneaky');
		expect(out).toContain(`@${ZWJ}octocat`);
		expect(out).toContain(`@${ZWJ}org/team`);
		expect(out).toContain(`#${ZWJ}12`);
		expect(out).toContain(`GH${ZWJ}-3`);
		expect(out).toContain(`repo#${ZWJ}4`);
		expect(out).toContain(`github${ZWJ}.com`);
		expect(out).not.toContain('<img');
		expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(out).toContain(`&amp;#${ZWJ}64;sneaky`);
		expect(out).not.toMatch(/@[A-Za-z]/);
		expect(out).not.toMatch(/#\d/);
	});

	test('page path keeps only the path', () => {
		expect(pagePath('/app/manifest?day=2026-11-14&secret=1#top')).toBe('/app/manifest');
		expect(pagePath('https://evil.example/app')).toBeNull();
		expect(pagePath('//evil.example/app')).toBeNull();
		expect(pagePath(null)).toBeNull();
	});

	test('title: type + first ~60 chars on one line, refs neutralised', () => {
		expect(issueTitle('idea', 'Short\nidea for @team')).toBe(`[Feedback] Idea: Short idea for @${ZWJ}team`);
		const long = issueTitle('bug', 'word '.repeat(40));
		expect(long.startsWith('[Feedback] Bug: word word')).toBe(true);
		expect(long.endsWith('…')).toBe(true);
		expect(long.length).toBeLessThanOrEqual('[Feedback] Bug: '.length + 61);
	});

	test('body: blockquoted message, details, no identity; labels per type', () => {
		const issue = buildIssue({
			type: 'bug',
			message: 'Line one @bob\n\n<b>bold</b> line two',
			page: '/app/logbook',
			version: 'abc1234',
			userAgent: 'UA `with` backticks\nnewline',
			roles: ['jumper'],
			reporterRef: '0123456789ab'
		});
		expect(issue.labels).toEqual(['feedback', 'bug']);
		expect(issue.body).toContain(`> Line one @${ZWJ}bob\n>\n> &lt;b&gt;bold&lt;/b&gt; line two`);
		expect(issue.body).toContain('- Page: `/app/logbook`');
		expect(issue.body).toContain('- App version: `abc1234`');
		expect(issue.body).toContain('- Browser: `UA  with  backticks newline`');
		expect(issue.body).toContain('- Role(s) at the active dropzone: `jumper`');
		expect(issue.body).toContain('- Reporter: `0123456789ab` (anonymous reference)');
		expect(buildIssue({ type: 'other', message: 'x'.repeat(20), page: null, version: 'v', userAgent: 'a'.repeat(500), roles: [], reporterRef: 'r' }).labels).toEqual([
			'feedback'
		]);
		const noPage = buildIssue({ type: 'idea', message: 'x'.repeat(20), page: null, version: 'v', userAgent: 'a'.repeat(500), roles: [], reporterRef: 'r' });
		expect(noPage.body).toContain('- Page: _not included_');
		expect(noPage.body).toContain(`- Browser: \`${'a'.repeat(200)}\``);
		expect(noPage.labels).toEqual(['feedback', 'idea']);
	});

	test('reporter ref = first 12 hex of HMAC-SHA256(secret, user id)', async () => {
		const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('k'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		const mac = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('user-1'))).toString('hex');
		expect(await reporterRef('k', 'user-1')).toBe(mac.slice(0, 12));
		expect(await reporterRef('k', 'user-2')).not.toBe(mac.slice(0, 12));
		expect(await reporterRef('other', 'user-1')).not.toBe(mac.slice(0, 12));
	});
});

describe('GitHub call', () => {
	test('posts title/body/labels with auth and API headers', async () => {
		const { fn, calls } = stubFetch(created(7));
		const r = await createGithubIssue(CFG, { title: 't', body: 'b', labels: ['feedback', 'bug'] }, { fetch: fn });
		expect(r).toEqual({ number: 7, url: 'https://github.com/owner/repo/issues/7' });
		expect(calls[0].url).toBe('http://github.test/repos/owner/repo/issues');
		const h = calls[0].init.headers as Record<string, string>;
		expect(h.Authorization).toBe('Bearer test-token');
		expect(h.Accept).toBe('application/vnd.github+json');
		expect(h['User-Agent']).toBeTruthy();
		expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
		expect(calls[0].body).toEqual({ title: 't', body: 'b', labels: ['feedback', 'bug'] });
	});

	test('422 with labels: one retry without labels', async () => {
		const { fn, calls } = stubFetch(status(422), created(8));
		expect((await createGithubIssue(CFG, { title: 't', body: 'b', labels: ['feedback'] }, { fetch: fn })).number).toBe(8);
		expect(calls).toHaveLength(2);
		expect(calls[1].body).toEqual({ title: 't', body: 'b' });
	});

	test('no retry on other 4xx, on 5xx, or on a second 422', async () => {
		for (const [res, n] of [
			[status(401), 1],
			[status(403), 1],
			[status(502), 1],
			[status(422), 2]
		] as const) {
			const { fn, calls } = stubFetch(res);
			const err = await createGithubIssue(CFG, { title: 't', body: 'b', labels: ['feedback'] }, { fetch: fn }).catch((e) => e);
			expect(err).toBeInstanceOf(FeedbackPostError);
			expect(calls).toHaveLength(n);
		}
	});

	test('times out (no hanging request)', async () => {
		const hang: FetchFn = (_u, init) =>
			new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError'))));
		const err = await createGithubIssue(CFG, { title: 't', body: 'b', labels: [] }, { fetch: hang, timeoutMs: 20 }).catch((e) => e);
		expect(err).toBeInstanceOf(FeedbackPostError);
		expect(err.status).toBe(0);
	});
});

describe('submitFeedback', () => {
	test('creates the issue, stores the submission with the reporter ref, never the identity', async () => {
		const db = freshDb();
		const u = await makeUser(db, { name: 'Jane Jumper', email: 'jane@example.com' });
		const { fn, calls } = stubFetch(created(42));
		const r = await submitFeedback(db, CFG, input(u.id, { message: 'Broken! mail jane@example.com, call 082 123 4567' }), { secret: 'k', fetch: fn, now: NOW });
		expect(r).toEqual({ ok: true, number: 42, url: 'https://github.com/owner/repo/issues/42', scrubbed: true });
		const sent = JSON.stringify(calls[0].body);
		expect(sent).not.toContain(u.id);
		expect(sent).not.toContain('Jane');
		expect(sent).not.toContain('jane@example.com');
		expect(sent).not.toContain('082 123');
		expect(sent).not.toContain('day=2026');
		expect(String(calls[0].body.body)).toContain('- Page: `/app/manifest`');
		const rows = await db.select().from(feedbackSubmissions).where(eq(feedbackSubmissions.userId, u.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ githubIssueNumber: 42, githubIssueUrl: 'https://github.com/owner/repo/issues/42', reporterRef: await reporterRef('k', u.id) });
		expect(String(calls[0].body.body)).toContain(rows[0].reporterRef);
	});

	test('validation: type and 10–5000 chars', async () => {
		const db = freshDb();
		const u = await makeUser(db);
		const { fn, calls } = stubFetch(created());
		for (const patch of [{ type: 'rant' }, { message: '   short   ' }, { message: 'x'.repeat(5001) }])
			expect(await submitFeedback(db, CFG, input(u.id, patch), { secret: 'k', fetch: fn, now: NOW })).toMatchObject({ ok: false, code: 'invalid' });
		expect(calls).toHaveLength(0);
	});

	test('rate limit: 1 per 30 s, 5 per rolling 24 h, per user', async () => {
		const db = freshDb();
		const u = await makeUser(db);
		const other = await makeUser(db);
		const { fn, calls } = stubFetch(created());
		const at = (s: number) => submitFeedback(db, CFG, input(u.id), { secret: 'k', fetch: fn, now: NOW + s * 1000 });
		expect((await at(0)).ok).toBe(true);
		expect(await at(10)).toMatchObject({ ok: false, code: 'cooldown' });
		expect((await submitFeedback(db, CFG, input(other.id), { secret: 'k', fetch: fn, now: NOW + 10_000 })).ok).toBe(true);
		for (const s of [31, 62, 93, 124]) expect((await at(s)).ok).toBe(true);
		expect(await at(200)).toMatchObject({ ok: false, code: 'daily' });
		expect(await rateLimit(db, u.id, NOW + 24 * 3600_000 + 1000)).toBeNull();
		expect(calls).toHaveLength(6);
	});

	test('GitHub failure: friendly error, no submission kept (does not count)', async () => {
		const db = freshDb();
		const u = await makeUser(db);
		for (const res of [status(500), status(401)]) {
			const { fn } = stubFetch(res);
			const r = await submitFeedback(db, CFG, input(u.id), { secret: 'k', fetch: fn, now: NOW });
			expect(r).toMatchObject({ ok: false, code: 'github' });
			if (!r.ok) expect(r.message).toContain('Your text is still below');
		}
		expect(await db.select().from(feedbackSubmissions)).toHaveLength(0);
		const { fn } = stubFetch(status(422), created(9));
		expect(await submitFeedback(db, CFG, input(u.id), { secret: 'k', fetch: fn, now: NOW })).toMatchObject({ ok: true, number: 9 });
	});
});

describe('reporter lookup', () => {
	test('maps a reporter ref back to the account and its issues', async () => {
		const db = freshDb();
		const u = await makeUser(db, { name: 'Rita Ref' });
		const { fn } = stubFetch(created(5), created(6));
		await submitFeedback(db, CFG, input(u.id), { secret: 'k', fetch: fn, now: NOW });
		await submitFeedback(db, CFG, input(u.id), { secret: 'k', fetch: fn, now: NOW + 60_000 });
		const ref = await reporterRef('k', u.id);
		const m = await lookupReporter(db, ref.toUpperCase());
		expect(m).toMatchObject({ userId: u.id, name: 'Rita Ref', deleted: false });
		expect(m!.issues.map((i) => i.number)).toEqual([6, 5]);
		expect(await lookupReporter(db, '000000000000')).toBeNull();
		expect(await lookupReporter(db, "x' or 1=1")).toBeNull();
	});
});
