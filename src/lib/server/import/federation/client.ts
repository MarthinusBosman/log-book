/**
 * Dropzone instance (INSTANCE_MODE=dropzone): OAuth client of the global instance, account
 * linking (authorization code + PKCE) and the outbox push. See docs/ARCHITECTURE.md → Federation.
 *
 * Config comes from env (FEDERATION_GLOBAL_URL / _CLIENT_ID / _CLIENT_SECRET) or, when those are
 * unset, from /app/settings/federation, stored as the `instances` row `federation-self` (status
 * `suspended` so it can never act as a client of *this* server; the secret is kept in
 * `client_secret_hash` as `stored:<secret>` because this side must present it).
 */
import { and, eq, inArray, like, not } from 'drizzle-orm';
import type { Database } from '../../db/index.ts';
import { federationOutbox, instances, linkedAccounts, users, type LinkedAccount } from '../../db/schema.ts';
import { newId } from '../../auth/token.ts';
import { GRANT_ISSUER_PREFIX, dueOutbox, enqueueUserJumps, markFailed, markSent, type FederatedJump } from '../../domain/federation.ts';
import { decrypt, encrypt, hmac, pkceChallenge, randomToken, sha256 } from './crypto.ts';

export const SELF_ID = 'federation-self';
export const LINK_COOKIE = 'fed_link';
export const CALLBACK_PATH = '/app/settings/linked-accounts/callback';

export type FedConfig = { globalUrl: string; clientId: string; clientSecret: string; source: 'env' | 'settings' };
export type FedEnv = { FEDERATION_GLOBAL_URL?: string; FEDERATION_CLIENT_ID?: string; FEDERATION_CLIENT_SECRET?: string };

export class FederationError extends Error {}

const trimUrl = (u: string) => u.trim().replace(/\/+$/, '');

export async function storedConfig(db: Database): Promise<Omit<FedConfig, 'source'> | null> {
	const row = (await db.select().from(instances).where(eq(instances.id, SELF_ID)).limit(1))[0];
	if (!row || !row.clientSecretHash.startsWith('stored:')) return null;
	return { globalUrl: row.origin, clientId: row.clientId, clientSecret: row.clientSecretHash.slice(7) };
}

export async function resolveConfig(db: Database, env: FedEnv): Promise<FedConfig | null> {
	if (env.FEDERATION_GLOBAL_URL && env.FEDERATION_CLIENT_ID && env.FEDERATION_CLIENT_SECRET) {
		return { globalUrl: trimUrl(env.FEDERATION_GLOBAL_URL), clientId: env.FEDERATION_CLIENT_ID, clientSecret: env.FEDERATION_CLIENT_SECRET, source: 'env' };
	}
	const s = await storedConfig(db);
	return s ? { ...s, source: 'settings' } : null;
}

export async function saveStoredConfig(db: Database, input: { globalUrl: string; clientId: string; clientSecret: string; name: string; createdBy: string }) {
	let url: URL;
	try {
		url = new URL(input.globalUrl.trim());
		if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
	} catch {
		throw new FederationError('Enter the global instance URL, e.g. https://log-book.app');
	}
	if (!/^dzc_[A-Za-z0-9_-]{8,}$/.test(input.clientId.trim())) throw new FederationError('That client ID looks wrong (it starts with dzc_).');
	const existing = await storedConfig(db);
	const secret = input.clientSecret.trim() || existing?.clientSecret || '';
	if (!/^dzs_[A-Za-z0-9_-]{20,}$/.test(secret)) throw new FederationError('That client secret looks wrong (it starts with dzs_).');
	const values = {
		name: input.name,
		origin: url.origin,
		redirectUris: [],
		clientId: input.clientId.trim(),
		clientSecretHash: `stored:${secret}`,
		status: 'suspended' as const,
		createdBy: input.createdBy
	};
	await db
		.insert(instances)
		.values({ id: SELF_ID, ...values })
		.onConflictDoUpdate({ target: instances.id, set: values });
}

export async function clearStoredConfig(db: Database) {
	await db.delete(instances).where(eq(instances.id, SELF_ID));
}

/** Probe the global instance's metadata endpoint. */
export async function testConnection(cfg: FedConfig, f: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
	try {
		const res = await f(`${cfg.globalUrl}/.well-known/oauth-authorization-server`, { headers: { accept: 'application/json' } });
		if (!res.ok) return { ok: false, message: `The global instance answered ${res.status}.` };
		const m = (await res.json()) as { token_endpoint?: string; federation_push_endpoint?: string };
		if (!m.token_endpoint || !m.federation_push_endpoint) return { ok: false, message: "That URL doesn't look like a global instance." };
		return { ok: true, message: 'Connected — the global instance is reachable.' };
	} catch {
		return { ok: false, message: "Couldn't reach the global instance." };
	}
}

// ── linking ──────────────────────────────────────────────────────────────────

export async function localLink(db: Database, userId: string): Promise<LinkedAccount | null> {
	return (
		(
			await db
				.select()
				.from(linkedAccounts)
				.where(and(eq(linkedAccounts.userId, userId), not(like(linkedAccounts.issuer, `${GRANT_ISSUER_PREFIX}%`))))
				.limit(1)
		)[0] ?? null
	);
}

export async function startLink(cfg: FedConfig, redirectUri: string): Promise<{ url: string; cookie: string }> {
	const state = randomToken(16);
	const verifier = randomToken(32);
	const u = new URL(`${cfg.globalUrl}/oauth/authorize`);
	u.searchParams.set('response_type', 'code');
	u.searchParams.set('client_id', cfg.clientId);
	u.searchParams.set('redirect_uri', redirectUri);
	u.searchParams.set('scope', 'openid profile logbook:write');
	u.searchParams.set('state', state);
	u.searchParams.set('code_challenge', await pkceChallenge(verifier));
	u.searchParams.set('code_challenge_method', 'S256');
	return { url: u.toString(), cookie: `${state}.${verifier}` };
}

const linkKey = (cfg: FedConfig) => sha256(`slot-link:${cfg.clientSecret}`);

type TokenJson = { access_token?: string; refresh_token?: string; scope?: string; error?: string; error_description?: string };

async function tokenRequest(cfg: FedConfig, body: Record<string, string>, f: typeof fetch): Promise<TokenJson> {
	let res: Response;
	try {
		// JSON body: SvelteKit's CSRF guard rejects form-encoded POSTs without a matching Origin.
		res = await f(`${cfg.globalUrl}/oauth/token`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				authorization: `Basic ${btoa(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`)}`
			},
			body: JSON.stringify(body)
		});
	} catch {
		throw new FederationError("Couldn't reach the global instance.");
	}
	const json = (await res.json().catch(() => ({}))) as TokenJson;
	if (!res.ok || !json.access_token) throw new FederationError(json.error_description ?? `Token request failed (${res.status}).`);
	return json;
}

export async function finishLink(
	db: Database,
	cfg: FedConfig,
	userId: string,
	p: { code: string | null; state: string | null; error?: string | null; cookie: string | undefined; redirectUri: string },
	f: typeof fetch = fetch,
	now = Date.now()
): Promise<{ subject: string; name?: string; email?: string; queued: number }> {
	if (p.error) throw new FederationError(p.error === 'access_denied' ? 'Linking was cancelled.' : `The global instance returned: ${p.error}`);
	const [state, verifier] = (p.cookie ?? '').split('.');
	if (!state || !verifier || !p.state || state !== p.state || !p.code) throw new FederationError('This link attempt expired. Start again.');
	const t = await tokenRequest(cfg, { grant_type: 'authorization_code', code: p.code, redirect_uri: p.redirectUri, code_verifier: verifier }, f);
	const infoRes = await f(`${cfg.globalUrl}/oauth/userinfo`, { headers: { authorization: `Bearer ${t.access_token}`, accept: 'application/json' } });
	const info = (await infoRes.json().catch(() => ({}))) as { sub?: string; name?: string; email?: string };
	if (!infoRes.ok || !info.sub) throw new FederationError("Couldn't read the global account.");
	const taken = (
		await db
			.select({ userId: linkedAccounts.userId })
			.from(linkedAccounts)
			.where(and(eq(linkedAccounts.issuer, cfg.globalUrl), eq(linkedAccounts.subject, info.sub)))
			.limit(1)
	)[0];
	if (taken && taken.userId !== userId) throw new FederationError('That global account is already linked to another user here.');
	const refreshTokenEnc = t.refresh_token ? await encrypt(await linkKey(cfg), t.refresh_token) : null;
	await db.delete(linkedAccounts).where(and(eq(linkedAccounts.userId, userId), not(like(linkedAccounts.issuer, `${GRANT_ISSUER_PREFIX}%`))));
	await db.insert(linkedAccounts).values({
		id: newId(),
		userId,
		issuer: cfg.globalUrl,
		subject: info.sub,
		refreshTokenEnc,
		scopes: t.scope ?? null,
		linkedAt: new Date(now)
	});
	await db.update(users).set({ globalId: info.sub, updatedAt: new Date(now) }).where(eq(users.id, userId));
	const queued = await enqueueUserJumps(db, userId, now);
	return { subject: info.sub, name: info.name, email: info.email, queued };
}

export async function unlink(db: Database, cfg: FedConfig | null, userId: string, f: typeof fetch = fetch) {
	const link = await localLink(db, userId);
	if (!link) return;
	if (cfg && link.refreshTokenEnc) {
		const token = await decrypt(await linkKey(cfg), link.refreshTokenEnc);
		if (token) {
			await f(`${cfg.globalUrl}/oauth/revoke`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Basic ${btoa(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`)}`
				},
				body: JSON.stringify({ token, token_type_hint: 'refresh_token' })
			}).catch(() => null);
		}
	}
	await db.delete(linkedAccounts).where(eq(linkedAccounts.id, link.id));
	await db.update(users).set({ globalId: null }).where(eq(users.id, userId));
	// Unsent items for this user are dropped: nothing to push them to.
	await db.delete(federationOutbox).where(and(eq(federationOutbox.userId, userId)));
}

// ── push ─────────────────────────────────────────────────────────────────────

export async function signedHeaders(cfg: FedConfig, body: string, now = Date.now()) {
	const key = await sha256(cfg.clientSecret);
	return {
		'content-type': 'application/json',
		accept: 'application/json',
		'x-slot-client-id': cfg.clientId,
		'x-slot-timestamp': String(now),
		'x-slot-signature': await hmac(key, `${now}.${body}`)
	};
}

export type FlushResult = { sent: number; failed: number; dropped: number; error?: string };

/** Push due outbox rows to the global instance (batches of 50). Safe to call concurrently-ish: idempotent on the global side. */
export async function flushOutbox(db: Database, cfg: FedConfig, f: typeof fetch = fetch, opts: { limit?: number; now?: number } = {}): Promise<FlushResult> {
	const now = opts.now ?? Date.now();
	const rows = await dueOutbox(db, opts.limit ?? 200, now);
	const out: FlushResult = { sent: 0, failed: 0, dropped: 0 };
	if (!rows.length) return out;
	const links = await db
		.select()
		.from(linkedAccounts)
		.where(and(inArray(linkedAccounts.userId, [...new Set(rows.map((r) => r.userId))]), eq(linkedAccounts.issuer, cfg.globalUrl)));
	const sub = new Map(links.map((l) => [l.userId, l.subject]));
	const orphan = rows.filter((r) => !sub.has(r.userId)).map((r) => r.id);
	if (orphan.length) {
		await db.delete(federationOutbox).where(inArray(federationOutbox.id, orphan));
		out.dropped += orphan.length;
	}
	const ready = rows.filter((r) => sub.has(r.userId));
	for (let i = 0; i < ready.length; i += 50) {
		const batch = ready.slice(i, i + 50);
		const body = JSON.stringify({
			items: batch.map((r) => ({ id: r.id, kind: r.kind, sub: sub.get(r.userId), jump: r.payload as FederatedJump }))
		});
		type R = { id: string; ok: boolean; error?: string };
		let results: R[] | null = null;
		let error = '';
		try {
			const res = await f(`${cfg.globalUrl}/api/federation/jumps`, { method: 'POST', headers: await signedHeaders(cfg, body, now), body });
			if (res.ok) results = ((await res.json()) as { results?: R[] }).results ?? null;
			else error = `Global instance answered ${res.status}`;
		} catch {
			error = "Couldn't reach the global instance";
		}
		if (!results) {
			await markFailed(db, batch.map((r) => r.id), error || 'Bad response', now);
			out.failed += batch.length;
			out.error = error;
			continue;
		}
		const ok = results.filter((r) => r.ok).map((r) => r.id);
		await markSent(db, ok, now);
		out.sent += ok.length;
		for (const r of results.filter((x) => !x.ok)) {
			await markFailed(db, [r.id], r.error ?? 'rejected', now);
			out.failed++;
		}
		if (ok.length) {
			const synced = [...new Set(batch.filter((b) => ok.includes(b.id)).map((b) => b.userId))];
			await db
				.update(linkedAccounts)
				.set({ lastSyncAt: new Date(now) })
				.where(and(inArray(linkedAccounts.userId, synced), eq(linkedAccounts.issuer, cfg.globalUrl)));
		}
	}
	return out;
}
