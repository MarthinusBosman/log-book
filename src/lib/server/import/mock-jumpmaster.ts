/**
 * A tiny in-memory imitation of the Firebase Auth REST + Firestore REST endpoints the connector
 * uses (signInWithPassword, documents get/list, runQuery, batchGet). For tests and the local
 * browser demo (`bun scripts/mock-jumpmaster.ts`) only — the real service is never contacted.
 */
import type { JmDoc } from '../../import/jumpmaster/values.ts';
import { encodeDoc } from './fixtures.ts';

export type MockAccount = { email: string; password: string; uid: string };
export type MockOptions = { projectId: string; apiKey: string; accounts: MockAccount[]; store: Map<string, JmDoc>; pageSize?: number };
export type MockLog = { method: string; path: string; body: string }[];

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
	});
}

export function createMockJumpMaster(opts: MockOptions) {
	const log: MockLog = [];
	const tokens = new Map<string, string>();
	const root = `projects/${opts.projectId}/databases/(default)/documents`;

	/** Security rules: own user tree; dropzone trees for their owner; user docs for DZ owners. */
	function canRead(uid: string, path: string): boolean {
		if (path === `users/${uid}` || path.startsWith(`users/${uid}/`)) return true;
		const dzId = path.match(/^dropzones\/([^/]+)/)?.[1];
		if (dzId) return opts.store.get(`dropzones/${dzId}`)?.owner === `users/${uid}`;
		if (/^users\/[^/]+$/.test(path)) {
			return [...opts.store.values()].some((d) => /^dropzones\/[^/]+$/.test(d.path ?? '') && d.owner === `users/${uid}`);
		}
		return false;
	}

	async function handle(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const body = req.method === 'POST' ? await req.text() : '';
		log.push({ method: req.method, path: url.pathname + url.search, body });
		if (req.method === 'OPTIONS') return json({});
		if (url.pathname === '/v1/accounts:signInWithPassword') {
			if (url.searchParams.get('key') !== opts.apiKey) return json({ error: { message: 'API key not valid' } }, 400);
			const { email, password } = JSON.parse(body || '{}');
			const acct = opts.accounts.find((a) => a.email === email);
			if (!acct) return json({ error: { message: 'EMAIL_NOT_FOUND' } }, 400);
			if (acct.password !== password) return json({ error: { message: 'INVALID_PASSWORD' } }, 400);
			const token = `tok_${acct.uid}_${crypto.randomUUID()}`;
			tokens.set(token, acct.uid);
			return json({ idToken: token, localId: acct.uid, email, refreshToken: 'r', expiresIn: '3600' });
		}
		const uid = tokens.get((req.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
		if (!uid) return json({ error: { code: 401, message: 'unauthenticated' } }, 401);
		const prefix = `/v1/${root}`;
		const pathname = decodeURIComponent(url.pathname);
		if (!pathname.startsWith(prefix)) return json({ error: { message: 'bad path' } }, 404);
		const rest = pathname.slice(prefix.length);
		if (rest === ':runQuery') {
			const q = JSON.parse(body).structuredQuery;
			const coll = q.from[0].collectionId;
			const want = String(q.where.fieldFilter.value.referenceValue).replace(`${root}/`, '');
			const docs = [...opts.store.values()].filter(
				(d) => new RegExp(`^${coll}/[^/]+$`).test(d.path ?? '') && d[q.where.fieldFilter.field.fieldPath] === want
			);
			const allowed = docs.filter((d) => canRead(uid, d.path!));
			return json(allowed.length ? allowed.map((d) => ({ document: encodeDoc(d, opts.projectId), readTime: 'x' })) : [{ readTime: 'x' }]);
		}
		if (rest === ':batchGet') {
			const names: string[] = JSON.parse(body).documents;
			return json(
				names.map((n) => {
					const p = n.replace(`${root}/`, '');
					const d = opts.store.get(p);
					return d && canRead(uid, p) ? { found: encodeDoc(d, opts.projectId) } : { missing: n };
				})
			);
		}
		const path = rest.replace(/^\//, '');
		const segs = path.split('/');
		if (!canRead(uid, path)) return json({ error: { code: 403, message: 'Missing or insufficient permissions.' } }, 403);
		if (segs.length % 2 === 0) {
			const d = opts.store.get(path);
			return d ? json(encodeDoc(d, opts.projectId)) : json({ error: { code: 404 } }, 404);
		}
		const all = [...opts.store.values()]
			.filter((d) => d.path?.startsWith(`${path}/`) && d.path.split('/').length === segs.length + 1)
			.sort((a, b) => a.path!.localeCompare(b.path!));
		const size = Math.min(Number(url.searchParams.get('pageSize') ?? 300), opts.pageSize ?? 300);
		const start = Number(url.searchParams.get('pageToken') ?? 0);
		const page = all.slice(start, start + size);
		const next = start + size < all.length ? String(start + size) : undefined;
		return json({ documents: page.map((d) => encodeDoc(d, opts.projectId)), ...(next ? { nextPageToken: next } : {}) });
	}

	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
		handle(new Request(typeof input === 'string' || input instanceof URL ? input.toString() : input, init))) as typeof fetch;
	return { fetch: fetchImpl, handle, log };
}
