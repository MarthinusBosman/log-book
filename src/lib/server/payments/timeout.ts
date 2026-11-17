/**
 * Every call to a payment provider gets a deadline. Without one a provider that accepts the
 * connection but never answers hangs the customer's checkout (and the worker) until the platform
 * kills the request; with it the caller's existing error path runs ("pay online" offered again,
 * "Test connection" shows the message, a webhook answers 500 so the provider retries).
 */
import { fetchWithDeadline } from '../fetch-timeout.ts';

export const PROVIDER_TIMEOUT_MS = 15_000;

/** Wraps `base` so each request aborts after `ms` (combined with any signal the caller passed). */
export function fetchWithTimeout(base: typeof fetch, ms = PROVIDER_TIMEOUT_MS): typeof fetch {
	return fetchWithDeadline(base, ms, 'The payment provider');
}
