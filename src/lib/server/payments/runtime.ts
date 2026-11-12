/** App-side wiring for payments: env (SECRETS_KEY, PAYMENTS_MOCK_URL) → ProviderContext. */
import { PAYMENTS_MOCK_URL, SECRETS_KEY } from '$app/env/private';
import type { ProviderContext } from './types.ts';

export function paymentsContext(): ProviderContext {
	return { fetch: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch, mockUrl: PAYMENTS_MOCK_URL ? PAYMENTS_MOCK_URL.replace(/\/$/, '') : null };
}

export function secretsKey(): string {
	return SECRETS_KEY;
}
