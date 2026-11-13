import { describe, expect, test } from 'bun:test';
import { ConsoleMailer, EmailError } from './types.ts';
import { RESEND_ENDPOINT, ResendMailer, defaultFrom, mailerFromEnv, parseRetryAfter, type FetchFn } from './resend.ts';

type Call = { url: string; init: RequestInit };

/** fetch stub returning the queued responses (or throwing queued errors) in order. Never hits Resend. */
function stub(...queue: (Response | Error)[]) {
	const calls: Call[] = [];
	const fetch: FetchFn = async (url, init) => {
		calls.push({ url, init });
		const next = queue.shift();
		if (!next) throw new Error('unexpected extra request');
		if (next instanceof Error) throw next;
		return next;
	};
	const sleeps: number[] = [];
	return { calls, fetch, sleeps, sleep: async (ms: number) => void sleeps.push(ms) };
}

const ok = (id = 'em_123') => new Response(JSON.stringify({ id }), { status: 200, headers: { 'content-type': 'application/json' } });
const err = (status: number, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify({ statusCode: status, name: 'some_error', message: `failed ${status}` }), { status, headers });
const msg = { to: 'jumper@example.com', subject: 'Hello', text: 'Plain body', html: '<p>Body</p>' };

function mailer(s: ReturnType<typeof stub>, extra: Partial<ConstructorParameters<typeof ResendMailer>[0]> = {}) {
	return new ResendMailer({ apiKey: 're_test', from: 'Log-Book <noreply@log-book.app>', fetch: s.fetch, sleep: s.sleep, ...extra });
}

describe('ResendMailer', () => {
	test('POSTs JSON with bearer auth, idempotency key and reply-to', async () => {
		const s = stub(ok());
		await mailer(s, { replyTo: 'hello@log-book.app' }).send({ ...msg, idempotencyKey: 'password-reset/abc' });
		expect(s.calls).toHaveLength(1);
		const { url, init } = s.calls[0];
		expect(url).toBe(RESEND_ENDPOINT);
		expect(init.method).toBe('POST');
		const h = init.headers as Record<string, string>;
		expect(h.Authorization).toBe('Bearer re_test');
		expect(h['Content-Type']).toBe('application/json');
		expect(h['Idempotency-Key']).toBe('password-reset/abc');
		expect(JSON.parse(init.body as string)).toEqual({
			from: 'Log-Book <noreply@log-book.app>',
			to: ['jumper@example.com'],
			subject: 'Hello',
			text: 'Plain body',
			html: '<p>Body</p>',
			reply_to: 'hello@log-book.app'
		});
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	test('no reply-to by default; generates a key so retries stay idempotent', async () => {
		const s = stub(err(500), ok());
		await mailer(s).send({ to: 'a@b.co', subject: 's', text: 't' });
		const keys = s.calls.map((c) => (c.init.headers as Record<string, string>)['Idempotency-Key']);
		expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
		expect(keys[1]).toBe(keys[0]);
		const body = JSON.parse(s.calls[0].init.body as string);
		expect(body.reply_to).toBeUndefined();
		expect(body.html).toBeUndefined();
	});

	test('retries network errors and 5xx with backoff, max 3 tries', async () => {
		const s = stub(new TypeError('fetch failed'), err(503), ok());
		await mailer(s).send(msg);
		expect(s.calls).toHaveLength(3);
		expect(s.sleeps).toEqual([250, 750]);

		const s2 = stub(err(500), err(502), err(500));
		const e = await mailer(s2).send(msg).catch((x) => x);
		expect(e).toBeInstanceOf(EmailError);
		expect(e.status).toBe(500);
		expect(s2.calls).toHaveLength(3);
	});

	test('never retries other 4xx', async () => {
		for (const status of [400, 401, 403, 422]) {
			const s = stub(err(status));
			const e = await mailer(s).send(msg).catch((x) => x);
			expect(e).toBeInstanceOf(EmailError);
			expect(e.status).toBe(status);
			expect(e.retryable).toBe(false);
			expect(e.message).toContain(`failed ${status}`);
			expect(s.calls).toHaveLength(1);
		}
	});

	test('429 waits a small retry-after, gives up on a long one', async () => {
		const s = stub(err(429, { 'retry-after': '1' }), ok());
		await mailer(s).send(msg);
		expect(s.sleeps).toEqual([1000]);

		const s2 = stub(err(429, { 'retry-after': '30' }));
		const e = await mailer(s2).send(msg).catch((x) => x);
		expect(e.status).toBe(429);
		expect(s2.calls).toHaveLength(1);
	});

	test('timeouts count as retryable; the deadline caps total time', async () => {
		const timeout = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
		const s = stub(timeout, ok());
		await mailer(s).send(msg);
		expect(s.calls).toHaveLength(2);

		// Fake clock: each attempt "takes" 5 s; with a 6 s deadline there is no room for another try.
		let t = 0;
		const s2 = stub(timeout, timeout, ok());
		const fetch2: FetchFn = async (u, i) => {
			t += 5000;
			return s2.fetch(u, i);
		};
		const e = await mailer(s2, { fetch: fetch2, now: () => t, deadlineMs: 6000 }).send(msg).catch((x) => x);
		expect(e).toBeInstanceOf(EmailError);
		expect(e.message).toContain('timed out');
		expect(s2.calls).toHaveLength(1);
	});

	test('parseRetryAfter: seconds or HTTP date', () => {
		expect(parseRetryAfter(null)).toBeNull();
		expect(parseRetryAfter('2')).toBe(2000);
		expect(parseRetryAfter(new Date(10_000).toUTCString(), 7_000)).toBe(3000);
		expect(parseRetryAfter('soon')).toBeNull();
	});
});

describe('mailerFromEnv', () => {
	test('RESEND_API_KEY picks Resend, else console; EMAIL_FROM defaults to the brand', async () => {
		expect(mailerFromEnv({})).toBeInstanceOf(ConsoleMailer);
		expect(mailerFromEnv({ RESEND_API_KEY: '' })).toBeInstanceOf(ConsoleMailer);
		const s = stub(ok(), ok());
		await mailerFromEnv({ RESEND_API_KEY: 're_x' }, { fetch: s.fetch }).send(msg);
		expect(JSON.parse(s.calls[0].init.body as string).from).toBe(defaultFrom());
		expect(defaultFrom()).toBe('Log-Book <noreply@log-book.app>');
		await mailerFromEnv({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'DZ <a@dz.example>', EMAIL_REPLY_TO: 'ops@dz.example' }, { fetch: s.fetch }).send(msg);
		expect(JSON.parse(s.calls[1].init.body as string)).toMatchObject({ from: 'DZ <a@dz.example>', reply_to: 'ops@dz.example' });
	});
});
