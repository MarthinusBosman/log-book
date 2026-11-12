/**
 * CSRF guard (replaces SvelteKit's built-in origin check, which is turned off with
 * `csrf.trustedOrigins: ['*']` in vite.config.ts). Same rule as Kit — reject form-encoded /
 * body-less mutating requests whose Origin isn't us — except for payment-provider webhooks
 * (`/api/payments/…`): PayFast posts its ITN form-encoded from its own servers with no Origin, and
 * those endpoints authenticate every request by signature instead.
 */
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Paths that authenticate callers themselves (provider signatures) and must accept cross-site posts. */
export const CSRF_EXEMPT_PREFIXES = ['/api/payments/'];

export function isCsrfForbidden(input: { method: string; contentType: string | null; origin: string | null; selfOrigin: string; pathname: string }): boolean {
	if (!MUTATING.has(input.method)) return false;
	if (CSRF_EXEMPT_PREFIXES.some((p) => input.pathname.startsWith(p))) return false;
	const type = (input.contentType ?? '').split(';')[0].trim().toLowerCase();
	const formLike = !input.contentType || FORM_TYPES.includes(type);
	return formLike && input.origin !== input.selfOrigin;
}
