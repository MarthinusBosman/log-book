/**
 * Every call to a payment provider gets a deadline. Without one a provider that accepts the
 * connection but never answers hangs the customer's checkout (and the worker) until the platform
 * kills the request; with it the caller's existing error path runs ("pay online" offered again,
 * "Test connection" shows the message, a webhook answers 500 so the provider retries).
 */
export const PROVIDER_TIMEOUT_MS = 15_000;

function hostOf(input: RequestInfo | URL): string {
	try {
		return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).host;
	} catch {
		return 'The payment provider';
	}
}

/** Wraps `base` so each request aborts after `ms` (combined with any signal the caller passed). */
export function fetchWithTimeout(base: typeof fetch, ms = PROVIDER_TIMEOUT_MS): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const deadline = AbortSignal.timeout(ms);
		const signal = init?.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, deadline]) : (init?.signal ?? deadline);
		try {
			return await base(input, { ...init, signal });
		} catch (e) {
			if (deadline.aborted && !init?.signal?.aborted) {
				throw new Error(`${hostOf(input)} did not answer within ${Math.max(1, Math.round(ms / 1000))} s. Try again in a moment.`, { cause: e });
			}
			throw e;
		}
	}) as typeof fetch;
}
