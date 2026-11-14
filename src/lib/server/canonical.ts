/**
 * Common guesses for the auth pages (typed URLs, links from other sites, password managers).
 * Only these exact paths: any other unknown URL stays a 404.
 */
const PATH_ALIASES: Record<string, string> = {
	'/register': '/signup',
	'/sign-up': '/signup',
	'/signin': '/login',
	'/sign-in': '/login',
	'/log-in': '/login'
};

/** `/register?next=x` → `/signup?next=x` (GET/HEAD only; trailing slash and case ignored). */
export function pathAliasRedirect(url: URL, method: string): string | null {
	if (method !== 'GET' && method !== 'HEAD') return null;
	const key = url.pathname.toLowerCase().replace(/\/+$/, '');
	const to = PATH_ALIASES[key];
	return to ? `${to}${url.search}` : null;
}

/**
 * Canonical-host redirect (env CANONICAL_HOST, e.g. `log-book.app`).
 *
 * Alias hosts of the same name — another TLD (`log-book.io`) or a `www.` prefix — are sent to
 * `https://<canonical><path><query>`: 301 for GET/HEAD, 308 for other methods (keeps the body).
 * Unrelated hosts (localhost, *.workers.dev previews, a self-hoster's own domain) are left alone,
 * so setting the variable can never lock you out of a preview URL.
 */
export function canonicalRedirect(url: URL, method: string, canonicalHost: string | undefined): { status: 301 | 308; location: string } | null {
	const canonical = canonicalHost?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
	if (!canonical) return null;
	const host = url.hostname.toLowerCase();
	if (host === canonical) return null;
	const bare = host.replace(/^www\./, '');
	const label = (h: string) => h.split('.')[0];
	const alias = bare === canonical || (bare.includes('.') && label(bare) === label(canonical));
	if (!alias) return null;
	const status = method === 'GET' || method === 'HEAD' ? 301 : 308;
	return { status, location: `https://${canonical}${url.pathname}${url.search}` };
}
