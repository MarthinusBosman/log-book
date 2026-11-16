import { describe, expect, test } from 'bun:test';
import { paystack } from './providers/paystack.ts';
import { fetchWithTimeout } from './timeout.ts';

/** A provider that accepts the request but never answers (until the signal aborts it). */
const hanging = ((_: RequestInfo | URL, init?: RequestInit) =>
	new Promise<Response>((_, reject) => {
		init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
	})) as typeof fetch;

describe('fetchWithTimeout', () => {
	test('a never-answering provider fails fast with a readable message', async () => {
		const f = fetchWithTimeout(hanging, 50);
		const t0 = Date.now();
		const err = await f('https://api.paystack.co/transaction/initialize', { method: 'POST' }).then(
			() => null,
			(e: unknown) => e
		);
		expect(Date.now() - t0).toBeLessThan(2000);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe('api.paystack.co did not answer within 1 s. Try again in a moment.');
	});

	test('passes answers and the request through, with a signal attached', async () => {
		let seen: RequestInit | undefined;
		const f = fetchWithTimeout(((_u: RequestInfo | URL, i?: RequestInit) => {
			seen = i;
			return Promise.resolve(new Response('ok'));
		}) as typeof fetch);
		const res = await f('https://example.test/x', { method: 'POST', body: 'a=1' });
		expect(await res.text()).toBe('ok');
		expect(seen?.method).toBe('POST');
		expect(seen?.body).toBe('a=1');
		expect(seen?.signal).toBeInstanceOf(AbortSignal);
	});

	test("a caller's own abort is passed through unchanged", async () => {
		const f = fetchWithTimeout(hanging, 10_000);
		const ac = new AbortController();
		const p = f('https://example.test/x', { signal: ac.signal });
		ac.abort(new Error('caller gave up'));
		await expect(p).rejects.toThrow('caller gave up');
	});

	test('other network errors are not rewritten', async () => {
		const f = fetchWithTimeout((() => Promise.reject(new TypeError('connection refused'))) as unknown as typeof fetch, 1000);
		await expect(f('https://example.test/x')).rejects.toThrow('connection refused');
	});

	test('"Test connection" against a hanging provider reports the timeout instead of hanging', async () => {
		const r = await paystack.testConnection!({ fetch: fetchWithTimeout(hanging, 50) }, { secretKey: 'sk_test_abc' } as never);
		expect(r.ok).toBe(false);
		expect(r.message).toContain('did not answer within');
	});
});
