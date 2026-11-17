/**
 * Outbound server-side fetch with a deadline. Without one a remote host that accepts the
 * connection but never answers hangs the request (and on Cloudflare the worker) until the
 * platform kills it; with it the caller's existing error path runs. Used by the payment
 * providers (`payments/timeout.ts`) and federation (`import/federation/client.ts`).
 */

/** Thrown when OUR deadline fired (not the caller's own signal, not other network errors). */
export class FetchTimeoutError extends Error {
	override name = 'FetchTimeoutError';
}

function hostOf(input: RequestInfo | URL, fallback: string): string {
	try {
		return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).host;
	} catch {
		return fallback;
	}
}

/** Wraps `base` so each request aborts after `ms` (combined with any signal the caller passed). */
export function fetchWithDeadline(base: typeof fetch, ms: number, fallbackHost = 'The server'): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const deadline = AbortSignal.timeout(ms);
		const signal = init?.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, deadline]) : (init?.signal ?? deadline);
		try {
			return await base(input, { ...init, signal });
		} catch (e) {
			if (deadline.aborted && !init?.signal?.aborted) {
				throw new FetchTimeoutError(`${hostOf(input, fallbackHost)} did not answer within ${Math.max(1, Math.round(ms / 1000))} s. Try again in a moment.`, { cause: e });
			}
			throw e;
		}
	}) as typeof fetch;
}
