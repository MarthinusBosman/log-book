import script from '../../../scripts/install.sh?raw';
import type { RequestHandler } from './$types';

/**
 * https://<site>/install.sh — the self-host installer (`curl -fsSL https://log-book.app/install.sh | bash`).
 * The body is scripts/install.sh, inlined at build time, so the served copy can't drift from the repo.
 */
export const GET: RequestHandler = () =>
	new Response(script, {
		headers: {
			'content-type': 'text/x-shellscript; charset=utf-8',
			'content-disposition': 'inline; filename="install.sh"',
			'cache-control': 'public, max-age=300',
			'x-content-type-options': 'nosniff'
		}
	});
