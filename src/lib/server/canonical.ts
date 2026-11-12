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
