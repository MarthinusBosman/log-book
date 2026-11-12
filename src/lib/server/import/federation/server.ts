/**
 * Global instance (INSTANCE_MODE=global): OAuth 2 authorization server for dropzone instances
 * and receiver of their signed logbook pushes. See docs/ARCHITECTURE.md → Federation.
 *
 * Storage without extra tables:
 *  - `instances`: registered clients. `client_secret_hash` = `sha256:<b64url(sha256(secret))>`;
 *    `public_key_jwk` holds this server's per-client token-signing key as an `oct` JWK (never sent
 *    to the client), so access tokens / auth codes are stateless HMAC tokens.
 *  - `linked_accounts` with issuer `instance:<id>`: the user's grant to that instance (refresh
 *    token hash, scopes, linked_at, last_sync_at). One per user × instance; deleting it revokes.
 *  - pushed jumps land in `logbook_jumps` (source `import`, source_ref `fed:<instance>:<jump>`).
 */
import { and, count, desc, eq, inArray, like } from 'drizzle-orm';
import type { Database } from '../../db/index.ts';
import { dropzones, instances, linkedAccounts, logbookJumps, users, type Instance, type User } from '../../db/schema.ts';
import { newId } from '../../auth/token.ts';
import { nextJumpNumber } from '../../domain/logbook.ts';
import { GRANT_ISSUER_PREFIX, type FederatedJump } from '../../domain/federation.ts';
import { fromB64url, hmacVerify, peekToken, pkceChallenge, randomToken, safeEqual, sha256b64, signToken, verifyToken, type Bytes } from './crypto.ts';

export const SCOPES = ['openid', 'profile', 'logbook:write'] as const;
export const ACCESS_TOKEN_TTL = 600; // seconds
export const CODE_TTL = 120; // seconds
export const SIGNATURE_SKEW_MS = 5 * 60_000;
export const MAX_PUSH_ITEMS = 200;

export class OAuthError extends Error {
	constructor(
		readonly error: string,
		readonly description: string,
		readonly status = 400
	) {
		super(description);
	}
	toResponse() {
		return Response.json({ error: this.error, error_description: this.description }, { status: this.status, headers: { 'cache-control': 'no-store' } });
	}
}

// ── instances ────────────────────────────────────────────────────────────────

export function normaliseOrigin(raw: string): string | null {
	try {
		const u = new URL(raw.trim());
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
		return u.origin;
	} catch {
		return null;
	}
}

export async function registerInstance(
	db: Database,
	input: { name: string; origin: string; redirectUris: string[]; dropzoneId?: string | null; createdBy: string },
	now = Date.now()
): Promise<{ instance: Instance; clientSecret: string }> {
	const origin = normaliseOrigin(input.origin);
	if (!origin) throw new OAuthError('invalid_request', 'Enter the instance URL, e.g. https://dz.example.com');
	const redirectUris = input.redirectUris.map((r) => r.trim()).filter(Boolean);
	if (!redirectUris.length) throw new OAuthError('invalid_request', 'At least one redirect URI is required.');
	for (const r of redirectUris) {
		const o = normaliseOrigin(r);
		if (!o || o !== origin) throw new OAuthError('invalid_request', `Redirect URI ${r} must be on ${origin}.`);
	}
	const clientSecret = `dzs_${randomToken(32)}`;
	const instance = (
		await db
			.insert(instances)
			.values({
				id: newId(),
				dropzoneId: input.dropzoneId ?? null,
				name: input.name.trim().slice(0, 120) || origin,
				origin,
				redirectUris,
				clientId: `dzc_${randomToken(12)}`,
				clientSecretHash: `sha256:${await sha256b64(clientSecret)}`,
				publicKeyJwk: { kty: 'oct', alg: 'HS256', use: 'sig', k: randomToken(32) },
				status: 'active',
				createdBy: input.createdBy,
				createdAt: new Date(now)
			})
			.returning()
	)[0];
	return { instance, clientSecret };
}

export async function listInstances(db: Database, opts: { createdBy?: string } = {}) {
	const q = db.select().from(instances);
	const rows = opts.createdBy ? await q.where(eq(instances.createdBy, opts.createdBy)).orderBy(desc(instances.createdAt)) : await q.orderBy(desc(instances.createdAt));
	if (!rows.length) return [];
	const linked = await db
		.select({ issuer: linkedAccounts.issuer, n: count() })
		.from(linkedAccounts)
		.where(inArray(linkedAccounts.issuer, rows.map((r) => GRANT_ISSUER_PREFIX + r.id)))
		.groupBy(linkedAccounts.issuer);
	const byIssuer = new Map(linked.map((l) => [l.issuer, l.n]));
	return rows.map((r) => ({ ...r, linkedUsers: byIssuer.get(GRANT_ISSUER_PREFIX + r.id) ?? 0 }));
}

export async function setInstanceStatus(db: Database, id: string, status: Instance['status']) {
	await db.update(instances).set({ status }).where(eq(instances.id, id));
	if (status === 'revoked') await db.delete(linkedAccounts).where(eq(linkedAccounts.issuer, GRANT_ISSUER_PREFIX + id));
}

/** New client secret (old one stops working immediately). */
export async function rotateSecret(db: Database, id: string): Promise<string> {
	const clientSecret = `dzs_${randomToken(32)}`;
	await db.update(instances).set({ clientSecretHash: `sha256:${await sha256b64(clientSecret)}` }).where(eq(instances.id, id));
	return clientSecret;
}

export async function findClient(db: Database, clientId: string): Promise<Instance | null> {
	const row = (await db.select().from(instances).where(eq(instances.clientId, clientId)).limit(1))[0];
	return row && row.status === 'active' ? row : null;
}

export async function authenticateClient(db: Database, clientId: string, secret: string): Promise<Instance | null> {
	const inst = await findClient(db, clientId);
	if (!inst || !secret) return null;
	return safeEqual(inst.clientSecretHash, `sha256:${await sha256b64(secret)}`) ? inst : null;
}

/** HMAC key both sides can derive: sha256(client_secret). */
function syncKey(inst: Instance): Bytes {
	return fromB64url(inst.clientSecretHash.replace(/^sha256:/, ''));
}

function tokenKey(inst: Instance): Bytes {
	const k = (inst.publicKeyJwk as { k?: string } | null)?.k;
	if (!k) throw new OAuthError('server_error', 'Instance has no signing key', 500);
	return fromB64url(k);
}

// ── authorize ────────────────────────────────────────────────────────────────

export type AuthorizeRequest = {
	instance: Instance;
	redirectUri: string;
	state: string;
	scope: string[];
	codeChallenge: string;
};

/**
 * Validate /oauth/authorize params. Errors that happen before the redirect URI is trusted are
 * returned as `fatal` (show an error page — never redirect to an unregistered URI).
 */
export async function validateAuthorize(
	db: Database,
	p: URLSearchParams
): Promise<{ ok: AuthorizeRequest } | { fatal: string } | { redirect: string }> {
	const instance = await findClient(db, p.get('client_id') ?? '');
	if (!instance) return { fatal: 'Unknown or disabled dropzone instance.' };
	const redirectUri = p.get('redirect_uri') ?? '';
	if (!instance.redirectUris.includes(redirectUri)) return { fatal: 'The redirect URI is not registered for this instance.' };
	const state = p.get('state') ?? '';
	const back = (error: string, description: string) => {
		const u = new URL(redirectUri);
		u.searchParams.set('error', error);
		u.searchParams.set('error_description', description);
		if (state) u.searchParams.set('state', state);
		return { redirect: u.toString() };
	};
	if (p.get('response_type') !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported.');
	const challenge = p.get('code_challenge') ?? '';
	if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || p.get('code_challenge_method') !== 'S256') {
		return back('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
	}
	const requested = (p.get('scope') ?? SCOPES.join(' ')).split(/\s+/).filter(Boolean);
	const scope = requested.filter((s) => (SCOPES as readonly string[]).includes(s));
	if (!scope.length) return back('invalid_scope', 'No supported scope requested.');
	return { ok: { instance, redirectUri, state, scope, codeChallenge: challenge } };
}

export async function issueCode(req: AuthorizeRequest, userId: string, now = Date.now()): Promise<string> {
	return signToken(tokenKey(req.instance), {
		typ: 'code',
		cid: req.instance.clientId,
		sub: userId,
		ru: req.redirectUri,
		sc: req.scope.join(' '),
		cc: req.codeChallenge,
		iat: now,
		exp: now + CODE_TTL * 1000,
		n: randomToken(8)
	});
}

export function denyRedirect(req: AuthorizeRequest): string {
	const u = new URL(req.redirectUri);
	u.searchParams.set('error', 'access_denied');
	u.searchParams.set('error_description', 'The jumper declined.');
	if (req.state) u.searchParams.set('state', req.state);
	return u.toString();
}

export function approveRedirect(req: AuthorizeRequest, code: string): string {
	const u = new URL(req.redirectUri);
	u.searchParams.set('code', code);
	if (req.state) u.searchParams.set('state', req.state);
	return u.toString();
}

// ── tokens ───────────────────────────────────────────────────────────────────

const grantIssuer = (inst: Instance) => GRANT_ISSUER_PREFIX + inst.id;

async function grantOf(db: Database, inst: Instance, userId: string) {
	return (
		await db
			.select()
			.from(linkedAccounts)
			.where(and(eq(linkedAccounts.issuer, grantIssuer(inst)), eq(linkedAccounts.subject, userId)))
			.limit(1)
	)[0];
}

export type TokenResponse = {
	access_token: string;
	token_type: 'Bearer';
	expires_in: number;
	refresh_token: string;
	scope: string;
};

async function tokens(db: Database, inst: Instance, userId: string, scope: string, now: number, isNew: boolean): Promise<TokenResponse> {
	const refresh = `dzr_${randomToken(32)}`;
	const refreshHash = `sha256:${await sha256b64(refresh)}`;
	if (isNew) {
		await db
			.insert(linkedAccounts)
			.values({ id: newId(), userId, issuer: grantIssuer(inst), subject: userId, refreshTokenEnc: refreshHash, scopes: scope, linkedAt: new Date(now) })
			.onConflictDoUpdate({
				target: [linkedAccounts.issuer, linkedAccounts.subject],
				set: { refreshTokenEnc: refreshHash, scopes: scope, linkedAt: new Date(now) }
			});
	} else {
		await db
			.update(linkedAccounts)
			.set({ refreshTokenEnc: refreshHash })
			.where(and(eq(linkedAccounts.issuer, grantIssuer(inst)), eq(linkedAccounts.subject, userId)));
	}
	const access = await signToken(tokenKey(inst), { typ: 'at', cid: inst.clientId, sub: userId, sc: scope, iat: now, exp: now + ACCESS_TOKEN_TTL * 1000 });
	return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL, refresh_token: refresh, scope };
}

export async function exchangeCode(
	db: Database,
	inst: Instance,
	p: { code: string; redirectUri: string; codeVerifier: string },
	now = Date.now()
): Promise<TokenResponse> {
	const c = await verifyToken<{ typ: string; cid: string; sub: string; ru: string; sc: string; cc: string; iat: number; exp: number }>(tokenKey(inst), p.code);
	if (!c || c.typ !== 'code' || c.cid !== inst.clientId) throw new OAuthError('invalid_grant', 'Invalid authorization code.');
	if (c.exp < now) throw new OAuthError('invalid_grant', 'Authorization code expired.');
	if (c.ru !== p.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri does not match.');
	if (!p.codeVerifier || !safeEqual(await pkceChallenge(p.codeVerifier), c.cc)) throw new OAuthError('invalid_grant', 'PKCE verification failed.');
	// Single use: a grant issued at/after this code's issue time means it was already redeemed.
	const existing = await grantOf(db, inst, c.sub);
	if (existing && existing.linkedAt.getTime() >= c.iat) throw new OAuthError('invalid_grant', 'Authorization code already used.');
	const user = (await db.select({ id: users.id }).from(users).where(eq(users.id, c.sub)).limit(1))[0];
	if (!user) throw new OAuthError('invalid_grant', 'User no longer exists.');
	return tokens(db, inst, c.sub, c.sc, Math.max(now, c.iat + 1), true);
}

export async function refreshGrant(db: Database, inst: Instance, refreshToken: string, now = Date.now()): Promise<TokenResponse> {
	const hash = `sha256:${await sha256b64(refreshToken)}`;
	const g = (
		await db
			.select()
			.from(linkedAccounts)
			.where(and(eq(linkedAccounts.issuer, grantIssuer(inst)), eq(linkedAccounts.refreshTokenEnc, hash)))
			.limit(1)
	)[0];
	if (!g) throw new OAuthError('invalid_grant', 'Refresh token is invalid or revoked.');
	return tokens(db, inst, g.subject, g.scopes ?? '', now, false);
}

export async function revokeRefresh(db: Database, inst: Instance, token: string) {
	const hash = `sha256:${await sha256b64(token)}`;
	await db.delete(linkedAccounts).where(and(eq(linkedAccounts.issuer, grantIssuer(inst)), eq(linkedAccounts.refreshTokenEnc, hash)));
}

export async function verifyAccessToken(db: Database, token: string, now = Date.now()): Promise<{ user: User; instance: Instance; scope: string[] } | null> {
	const peek = peekToken<{ cid?: string }>(token);
	if (!peek?.cid) return null;
	const inst = await findClient(db, peek.cid);
	if (!inst) return null;
	const t = await verifyToken<{ typ: string; cid: string; sub: string; sc: string; exp: number }>(tokenKey(inst), token);
	if (!t || t.typ !== 'at' || t.exp < now) return null;
	if (!(await grantOf(db, inst, t.sub))) return null; // revoked
	const user = (await db.select().from(users).where(eq(users.id, t.sub)).limit(1))[0];
	return user ? { user, instance: inst, scope: t.sc.split(' ') } : null;
}

export function userinfo(u: User, scope: string[]) {
	const info: Record<string, unknown> = { sub: u.id };
	if (scope.includes('profile')) {
		Object.assign(info, {
			name: u.name,
			email: u.email,
			licence: u.licence,
			association: u.association,
			association_number: u.associationNumber
		});
	}
	return info;
}

// ── HTTP handlers (thin +server.ts wrappers call these) ──────────────────────

async function readParams(request: Request): Promise<URLSearchParams> {
	const type = request.headers.get('content-type') ?? '';
	if (type.includes('application/json')) {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v ?? '')]));
	}
	return new URLSearchParams(await request.text());
}

function clientCredentials(request: Request, p: URLSearchParams): [string, string] {
	const auth = request.headers.get('authorization') ?? '';
	if (auth.startsWith('Basic ')) {
		try {
			const [id, secret] = atob(auth.slice(6)).split(':');
			return [decodeURIComponent(id ?? ''), decodeURIComponent(secret ?? '')];
		} catch {
			/* fall through */
		}
	}
	return [p.get('client_id') ?? '', p.get('client_secret') ?? ''];
}

export async function handleToken(db: Database, request: Request, now = Date.now()): Promise<Response> {
	try {
		const p = await readParams(request);
		const [id, secret] = clientCredentials(request, p);
		const inst = await authenticateClient(db, id, secret);
		if (!inst) throw new OAuthError('invalid_client', 'Client authentication failed.', 401);
		const grant = p.get('grant_type');
		let res: TokenResponse;
		if (grant === 'authorization_code') {
			res = await exchangeCode(db, inst, { code: p.get('code') ?? '', redirectUri: p.get('redirect_uri') ?? '', codeVerifier: p.get('code_verifier') ?? '' }, now);
		} else if (grant === 'refresh_token') {
			res = await refreshGrant(db, inst, p.get('refresh_token') ?? '', now);
		} else throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
		return Response.json(res, { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } });
	} catch (e) {
		if (e instanceof OAuthError) return e.toResponse();
		throw e;
	}
}

export async function handleRevoke(db: Database, request: Request): Promise<Response> {
	const p = await readParams(request);
	const [id, secret] = clientCredentials(request, p);
	const inst = await authenticateClient(db, id, secret);
	if (!inst) return new OAuthError('invalid_client', 'Client authentication failed.', 401).toResponse();
	await revokeRefresh(db, inst, p.get('token') ?? '');
	return new Response(null, { status: 200 });
}

export async function handleUserinfo(db: Database, request: Request, now = Date.now()): Promise<Response> {
	const auth = request.headers.get('authorization') ?? '';
	const v = auth.startsWith('Bearer ') ? await verifyAccessToken(db, auth.slice(7), now) : null;
	if (!v) return Response.json({ error: 'invalid_token' }, { status: 401, headers: { 'www-authenticate': 'Bearer error="invalid_token"' } });
	return Response.json(userinfo(v.user, v.scope), { headers: { 'cache-control': 'no-store' } });
}

export type PushItem = { id: string; kind: 'jump_upsert' | 'jump_delete'; sub: string; jump: FederatedJump };
export type PushResult = { id: string; ok: boolean; error?: string };

/** Verify `x-slot-*` headers: HMAC-SHA256(sha256(client_secret), `${ts}.${body}`). */
export async function verifySignedRequest(db: Database, request: Request, body: string, now = Date.now()): Promise<Instance | null> {
	const inst = await findClient(db, request.headers.get('x-slot-client-id') ?? '');
	const ts = Number(request.headers.get('x-slot-timestamp'));
	const sig = request.headers.get('x-slot-signature') ?? '';
	if (!inst || !Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_SKEW_MS) return null;
	return (await hmacVerify(syncKey(inst), `${ts}.${body}`, sig)) ? inst : null;
}

export async function receiveJumps(db: Database, inst: Instance, items: PushItem[], now = Date.now()): Promise<PushResult[]> {
	const dzName = inst.dropzoneId
		? ((await db.select({ name: dropzones.name }).from(dropzones).where(eq(dropzones.id, inst.dropzoneId)).limit(1))[0]?.name ?? inst.name)
		: inst.name;
	const results: PushResult[] = [];
	const synced = new Set<string>();
	for (const it of items) {
		const g = it.sub ? await grantOf(db, inst, it.sub) : undefined;
		if (!g || !(g.scopes ?? '').split(' ').includes('logbook:write')) {
			results.push({ id: it.id, ok: false, error: 'not_linked' });
			continue;
		}
		const j = it.jump;
		const ref = `fed:${inst.id}:${j?.id ?? ''}`;
		const existing = (
			await db
				.select()
				.from(logbookJumps)
				.where(and(eq(logbookJumps.userId, g.subject), eq(logbookJumps.source, 'import'), eq(logbookJumps.sourceRef, ref)))
				.limit(1)
		)[0];
		if (it.kind === 'jump_delete') {
			if (existing) await db.delete(logbookJumps).where(eq(logbookJumps.id, existing.id));
			results.push({ id: it.id, ok: true });
			synced.add(g.id);
			continue;
		}
		if (!j?.id || !/^\d{4}-\d{2}-\d{2}$/.test(j.jumpDate ?? '')) {
			results.push({ id: it.id, ok: false, error: 'invalid_jump' });
			continue;
		}
		const fields = {
			jumpDate: j.jumpDate,
			dropzoneId: inst.dropzoneId ?? null,
			location: (j.location ?? dzName)?.slice(0, 200) ?? null,
			aircraft: j.aircraft?.slice(0, 120) ?? null,
			altitudeFt: Number.isFinite(j.altitudeFt) ? j.altitudeFt : null,
			freefallSeconds: Number.isFinite(j.freefallSeconds) ? j.freefallSeconds : null,
			jumpType: j.jumpType?.slice(0, 40) ?? null,
			description: j.description?.slice(0, 2000) ?? null,
			// "Verified by" the source dropzone (its name travels as the jump location).
			signerName: (j.location ?? dzName).slice(0, 200),
			verified: !!j.verified,
			updatedAt: new Date(now)
		};
		if (existing) await db.update(logbookJumps).set(fields).where(eq(logbookJumps.id, existing.id));
		else {
			await db
				.insert(logbookJumps)
				.values({ id: newId(), userId: g.subject, jumpNumber: await nextJumpNumber(db, g.subject), source: 'import', sourceRef: ref, createdAt: new Date(now), ...fields })
				.onConflictDoNothing();
		}
		results.push({ id: it.id, ok: true });
		synced.add(g.id);
	}
	if (synced.size) await db.update(linkedAccounts).set({ lastSyncAt: new Date(now) }).where(inArray(linkedAccounts.id, [...synced]));
	return results;
}

export async function handlePush(db: Database, request: Request, now = Date.now()): Promise<Response> {
	const body = await request.text();
	const inst = await verifySignedRequest(db, request, body, now);
	if (!inst) return Response.json({ error: 'invalid_signature' }, { status: 401 });
	let items: PushItem[];
	try {
		items = (JSON.parse(body) as { items?: PushItem[] }).items ?? [];
	} catch {
		return Response.json({ error: 'invalid_json' }, { status: 400 });
	}
	if (!Array.isArray(items) || items.length > MAX_PUSH_ITEMS) return Response.json({ error: 'too_many_items' }, { status: 413 });
	return Response.json({ results: await receiveJumps(db, inst, items, now) });
}

export function metadata(issuer: string) {
	return {
		issuer,
		authorization_endpoint: `${issuer}/oauth/authorize`,
		token_endpoint: `${issuer}/oauth/token`,
		userinfo_endpoint: `${issuer}/oauth/userinfo`,
		revocation_endpoint: `${issuer}/oauth/revoke`,
		federation_push_endpoint: `${issuer}/api/federation/jumps`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
		scopes_supported: SCOPES
	};
}

// ── jumper-facing (global) ───────────────────────────────────────────────────

/** Dropzone instances this user has linked (their grants). */
export async function listGrants(db: Database, userId: string) {
	const grants = await db
		.select()
		.from(linkedAccounts)
		.where(and(eq(linkedAccounts.userId, userId), like(linkedAccounts.issuer, `${GRANT_ISSUER_PREFIX}%`)));
	if (!grants.length) return [];
	const ids = grants.map((g) => g.issuer.slice(GRANT_ISSUER_PREFIX.length));
	const insts = await db.select().from(instances).where(inArray(instances.id, ids));
	const byId = new Map(insts.map((i) => [i.id, i]));
	const out = [];
	for (const g of grants) {
		const inst = byId.get(g.issuer.slice(GRANT_ISSUER_PREFIX.length));
		if (!inst) continue;
		const [n] = await db
			.select({ n: count() })
			.from(logbookJumps)
			.where(and(eq(logbookJumps.userId, userId), like(logbookJumps.sourceRef, `fed:${inst.id}:%`)));
		out.push({ grantId: g.id, instanceId: inst.id, name: inst.name, origin: inst.origin, scopes: g.scopes, linkedAt: g.linkedAt, lastSyncAt: g.lastSyncAt, jumps: n.n });
	}
	return out;
}

export async function revokeGrant(db: Database, userId: string, grantId: string) {
	await db
		.delete(linkedAccounts)
		.where(and(eq(linkedAccounts.id, grantId), eq(linkedAccounts.userId, userId), like(linkedAccounts.issuer, `${GRANT_ISSUER_PREFIX}%`)));
}

