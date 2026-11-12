import { describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/index.ts';
import { federationOutbox, linkedAccounts, logbookJumps, users } from '../../db/schema.ts';
import { addSlot, completeLoad, createLoads } from '../../domain/loads.ts';
import { outboxStats } from '../../domain/federation.ts';
import { DAY, NOW, freshDb, makeDropzone, makeUser } from '../../domain/testing.ts';
import {
	approveRedirect,
	handlePush,
	handleRevoke,
	handleToken,
	handleUserinfo,
	issueCode,
	listGrants,
	metadata,
	registerInstance,
	revokeGrant,
	validateAuthorize
} from './server.ts';
import { CALLBACK_PATH, FederationError, finishLink, flushOutbox, localLink, resolveConfig, saveStoredConfig, signedHeaders, startLink, unlink, type FedConfig } from './client.ts';
import { pkceChallenge } from './crypto.ts';

const GLOBAL = 'http://global.test';
const DZ = 'http://dz.test';
const REDIRECT = DZ + CALLBACK_PATH;

/** fetch that routes to the global instance's handlers on `gdb`. */
function globalFetch(gdb: Database, log: string[] = [], clock = () => Date.now()): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const req = new Request(typeof input === 'string' || input instanceof URL ? input.toString() : input, init);
		const path = new URL(req.url).pathname;
		log.push(`${req.method} ${path}`);
		if (path === '/oauth/token') return handleToken(gdb, req, clock());
		if (path === '/oauth/userinfo') return handleUserinfo(gdb, req, clock());
		if (path === '/oauth/revoke') return handleRevoke(gdb, req);
		if (path === '/api/federation/jumps') return handlePush(gdb, req, clock());
		if (path === '/.well-known/oauth-authorization-server') return Response.json(metadata(GLOBAL));
		return new Response('not found', { status: 404 });
	}) as typeof fetch;
}

async function setup() {
	const gdb = freshDb();
	const ddb = freshDb();
	const gOwner = await makeUser(gdb, { name: 'Global Owner' });
	const gJumper = await makeUser(gdb, { name: 'Jo Global', email: 'jo@global.example', licence: 'C-1234', association: 'pasa' });
	const { instance, clientSecret } = await registerInstance(gdb, { name: 'Demo DZ instance', origin: DZ, redirectUris: [REDIRECT], createdBy: gOwner.id });
	const cfg: FedConfig = { globalUrl: GLOBAL, clientId: instance.clientId, clientSecret, source: 'env' };
	const { dz } = await makeDropzone(ddb, { settings: { defaultAltitudeFt: 13000 } });
	const local = await makeUser(ddb, { name: 'Jo Local', email: 'jo@dz.example' });
	return { gdb, ddb, gJumper, instance, clientSecret, cfg, dz, local };
}

/** Browser leg: dz → global authorize (jumper approves) → callback params. */
async function authorize(gdb: Database, cfg: FedConfig, globalUserId: string, now = Date.now()) {
	const { url, cookie } = await startLink(cfg, REDIRECT);
	const v = await validateAuthorize(gdb, new URL(url).searchParams);
	if (!('ok' in v)) throw new Error(JSON.stringify(v));
	const back = new URL(approveRedirect(v.ok, await issueCode(v.ok, globalUserId, now)));
	return { cookie, code: back.searchParams.get('code'), state: back.searchParams.get('state') };
}

async function link(s: Awaited<ReturnType<typeof setup>>, f = globalFetch(s.gdb)) {
	const cb = await authorize(s.gdb, s.cfg, s.gJumper.id);
	return finishLink(s.ddb, s.cfg, s.local.id, { ...cb, redirectUri: REDIRECT }, f);
}

async function completeOneLoad(s: Awaited<ReturnType<typeof setup>>, userIds: string[], now = NOW) {
	const [load] = await createLoads(s.ddb, { dropzoneId: s.dz.id, day: DAY, capacity: 8, aircraftName: 'Caravan' });
	for (const u of userIds) await addSlot(s.ddb, load.id, { userId: u, jumpType: 'belly' });
	await completeLoad(s.ddb, load.id, { now });
	return load;
}

describe('authorization server', () => {
	test('registration hashes the secret and stores a server-only signing key', async () => {
		const s = await setup();
		expect(s.instance.clientSecretHash).toMatch(/^sha256:/);
		expect(s.instance.clientSecretHash).not.toContain(s.clientSecret);
		expect((s.instance.publicKeyJwk as { kty: string }).kty).toBe('oct');
		await expect(registerInstance(s.gdb, { name: 'x', origin: DZ, redirectUris: ['https://evil.example/cb'], createdBy: s.gJumper.id })).rejects.toThrow(/must be on/);
	});

	test('authorize validation: unknown client and unregistered redirect are fatal; missing PKCE redirects back', async () => {
		const s = await setup();
		const p = (o: Record<string, string>) => new URLSearchParams(o);
		expect(await validateAuthorize(s.gdb, p({ client_id: 'dzc_nope', redirect_uri: REDIRECT }))).toHaveProperty('fatal');
		expect(await validateAuthorize(s.gdb, p({ client_id: s.cfg.clientId, redirect_uri: 'http://evil/cb' }))).toHaveProperty('fatal');
		const r = await validateAuthorize(s.gdb, p({ client_id: s.cfg.clientId, redirect_uri: REDIRECT, response_type: 'code', state: 'st' }));
		expect('redirect' in r && r.redirect).toContain('error=invalid_request');
		expect('redirect' in r && r.redirect).toContain('state=st');
	});

	test('code exchange needs the right secret, verifier and redirect; codes are single-use', async () => {
		const s = await setup();
		const cb = await authorize(s.gdb, s.cfg, s.gJumper.id);
		const verifier = cb.cookie.split('.')[1];
		const post = (body: Record<string, string>, secret = s.clientSecret) =>
			handleToken(
				s.gdb,
				new Request(`${GLOBAL}/oauth/token`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ client_id: s.cfg.clientId, client_secret: secret, ...body })
				})
			);
		const base = { grant_type: 'authorization_code', code: cb.code!, redirect_uri: REDIRECT };
		expect((await post({ ...base, code_verifier: verifier }, 'dzs_wrong')).status).toBe(401);
		expect(await (await post({ ...base, code_verifier: 'x'.repeat(43) })).json()).toMatchObject({ error: 'invalid_grant' });
		expect(await (await post({ ...base, redirect_uri: DZ + '/other', code_verifier: verifier })).json()).toMatchObject({ error: 'invalid_grant' });
		const ok = await post({ ...base, code_verifier: verifier });
		expect(ok.status).toBe(200);
		const t = (await ok.json()) as { access_token: string; refresh_token: string; expires_in: number };
		expect(t.expires_in).toBe(600);
		const replay = await post({ ...base, code_verifier: verifier });
		expect(await replay.json()).toMatchObject({ error: 'invalid_grant', error_description: expect.stringMatching(/already used/) });

		// userinfo
		const ui = await handleUserinfo(s.gdb, new Request(`${GLOBAL}/oauth/userinfo`, { headers: { authorization: `Bearer ${t.access_token}` } }));
		expect(await ui.json()).toMatchObject({ sub: s.gJumper.id, name: 'Jo Global', email: 'jo@global.example', licence: 'C-1234', association: 'pasa' });
		// expired access token
		const late = await handleUserinfo(s.gdb, new Request(`${GLOBAL}/oauth/userinfo`, { headers: { authorization: `Bearer ${t.access_token}` } }), Date.now() + 601_000);
		expect(late.status).toBe(401);
		// refresh rotates
		const r1 = await post({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
		const t2 = (await r1.json()) as { refresh_token: string };
		expect(t2.refresh_token).not.toBe(t.refresh_token);
		expect((await post({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).status).toBe(400);
		// revoking the grant kills access tokens
		const [g] = await listGrants(s.gdb, s.gJumper.id);
		await revokeGrant(s.gdb, s.gJumper.id, g.grantId);
		const after = await handleUserinfo(s.gdb, new Request(`${GLOBAL}/oauth/userinfo`, { headers: { authorization: `Bearer ${t.access_token}` } }));
		expect(after.status).toBe(401);
	});

	test('PKCE challenge is S256 of the verifier', async () => {
		expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
	});
});

describe('linking + sync', () => {
	test('link stores the subject + encrypted refresh token and sets users.global_id', async () => {
		const s = await setup();
		const r = await link(s);
		expect(r).toMatchObject({ subject: s.gJumper.id, name: 'Jo Global' });
		const l = await localLink(s.ddb, s.local.id);
		expect(l).toMatchObject({ issuer: GLOBAL, subject: s.gJumper.id });
		expect(l!.refreshTokenEnc).not.toMatch(/^dzr_/);
		const u = (await s.ddb.select().from(users).where(eq(users.id, s.local.id)))[0];
		expect(u.globalId).toBe(s.gJumper.id);
		const grants = await listGrants(s.gdb, s.gJumper.id);
		expect(grants).toHaveLength(1);
		expect(grants[0]).toMatchObject({ name: 'Demo DZ instance', origin: DZ });
	});

	test('state mismatch and cancelled consent are rejected', async () => {
		const s = await setup();
		const cb = await authorize(s.gdb, s.cfg, s.gJumper.id);
		await expect(finishLink(s.ddb, s.cfg, s.local.id, { ...cb, state: 'other', redirectUri: REDIRECT }, globalFetch(s.gdb))).rejects.toBeInstanceOf(FederationError);
		await expect(
			finishLink(s.ddb, s.cfg, s.local.id, { code: null, state: null, error: 'access_denied', cookie: cb.cookie, redirectUri: REDIRECT }, globalFetch(s.gdb))
		).rejects.toThrow(/cancelled/);
	});

	test('completed load → outbox → signed push → jump in the global logbook, idempotent', async () => {
		const s = await setup();
		await link(s);
		const other = await makeUser(s.ddb); // not linked: never queued
		await completeOneLoad(s, [s.local.id, other.id]);
		const queued = await s.ddb.select().from(federationOutbox);
		expect(queued).toHaveLength(1);
		expect(queued[0].userId).toBe(s.local.id);

		const log: string[] = [];
		const r = await flushOutbox(s.ddb, s.cfg, globalFetch(s.gdb, log));
		expect(r).toMatchObject({ sent: 1, failed: 0 });
		expect(log).toContain('POST /api/federation/jumps');
		const gj = await s.gdb.select().from(logbookJumps).where(eq(logbookJumps.userId, s.gJumper.id));
		expect(gj).toHaveLength(1);
		expect(gj[0]).toMatchObject({ jumpDate: DAY, aircraft: 'Caravan', altitudeFt: 13000, source: 'import', verified: true, location: s.dz.name });
		expect(gj[0].sourceRef).toBe(`fed:${s.instance.id}:${queued[0].entityId}`);
		expect(gj[0].signerName).toBe(s.dz.name);
		expect((await listGrants(s.gdb, s.gJumper.id))[0]).toMatchObject({ jumps: 1 });
		expect((await localLink(s.ddb, s.local.id))!.lastSyncAt).toBeTruthy();

		// nothing left; re-sending the same item (e.g. lost response) doesn't duplicate
		expect(await flushOutbox(s.ddb, s.cfg, globalFetch(s.gdb))).toMatchObject({ sent: 0 });
		await s.ddb.update(federationOutbox).set({ sentAt: null });
		await flushOutbox(s.ddb, s.cfg, globalFetch(s.gdb));
		expect(await s.gdb.select().from(logbookJumps).where(eq(logbookJumps.userId, s.gJumper.id))).toHaveLength(1);
		expect(await outboxStats(s.ddb)).toMatchObject({ pending: 0, sent: 1 });
	});

	test('linking backfills earlier load jumps', async () => {
		const s = await setup();
		await completeOneLoad(s, [s.local.id]);
		const r = await link(s);
		expect(r.queued).toBe(1);
		await flushOutbox(s.ddb, s.cfg, globalFetch(s.gdb));
		expect(await s.gdb.select().from(logbookJumps).where(eq(logbookJumps.userId, s.gJumper.id))).toHaveLength(1);
	});

	test('bad signature, stale timestamp and unlinked subjects are refused', async () => {
		const s = await setup();
		await link(s);
		const body = JSON.stringify({ items: [{ id: 'o1', kind: 'jump_upsert', sub: s.gJumper.id, jump: { id: 'j1', jumpNumber: 1, jumpDate: DAY } }] });
		const send = async (headers: Record<string, string>, now = Date.now()) =>
			handlePush(s.gdb, new Request(`${GLOBAL}/api/federation/jumps`, { method: 'POST', headers, body }), now);
		const forged = await signedHeaders({ ...s.cfg, clientSecret: 'dzs_wrong' }, body);
		expect((await send(forged)).status).toBe(401);
		const old = await signedHeaders(s.cfg, body, Date.now() - 10 * 60_000);
		expect((await send(old)).status).toBe(401);
		expect((await send(await signedHeaders(s.cfg, body))).status).toBe(200);
		const stranger = await makeUser(s.gdb);
		const body2 = JSON.stringify({ items: [{ id: 'o2', kind: 'jump_upsert', sub: stranger.id, jump: { id: 'j2', jumpNumber: 1, jumpDate: DAY } }] });
		const res = await handlePush(s.gdb, new Request(`${GLOBAL}/api/federation/jumps`, { method: 'POST', headers: await signedHeaders(s.cfg, body2), body: body2 }));
		expect(await res.json()).toEqual({ results: [{ id: 'o2', ok: false, error: 'not_linked' }] });
	});

	test('global down → retries with backoff; unlink revokes the grant and clears the queue', async () => {
		const s = await setup();
		await link(s);
		await completeOneLoad(s, [s.local.id]);
		const down = (async () => {
			throw new Error('ECONNREFUSED');
		}) as unknown as typeof fetch;
		const r = await flushOutbox(s.ddb, s.cfg, down, { now: NOW });
		expect(r).toMatchObject({ failed: 1 });
		const [row] = await s.ddb.select().from(federationOutbox);
		expect(row.attempts).toBe(1);
		expect(row.nextAttemptAt!.getTime()).toBe(NOW + 60_000);
		expect(await flushOutbox(s.ddb, s.cfg, globalFetch(s.gdb), { now: NOW + 1000 })).toMatchObject({ sent: 0 });

		await unlink(s.ddb, s.cfg, s.local.id, globalFetch(s.gdb));
		expect(await localLink(s.ddb, s.local.id)).toBeNull();
		expect(await s.ddb.select().from(federationOutbox)).toHaveLength(0);
		expect(await listGrants(s.gdb, s.gJumper.id)).toHaveLength(0);
		const u = (await s.ddb.select().from(users).where(eq(users.id, s.local.id)))[0];
		expect(u.globalId).toBeNull();
	});

	test('config: env wins over stored settings; stored secret validated', async () => {
		const s = await setup();
		expect(await resolveConfig(s.ddb, {})).toBeNull();
		await expect(saveStoredConfig(s.ddb, { globalUrl: 'nope', clientId: s.cfg.clientId, clientSecret: s.clientSecret, name: 'x', createdBy: s.local.id })).rejects.toThrow();
		await saveStoredConfig(s.ddb, { globalUrl: GLOBAL + '/', clientId: s.cfg.clientId, clientSecret: s.clientSecret, name: 'x', createdBy: s.local.id });
		expect(await resolveConfig(s.ddb, {})).toMatchObject({ globalUrl: GLOBAL, source: 'settings', clientSecret: s.clientSecret });
		// keep the stored secret when the field is left blank
		await saveStoredConfig(s.ddb, { globalUrl: GLOBAL, clientId: s.cfg.clientId, clientSecret: '', name: 'x', createdBy: s.local.id });
		expect((await resolveConfig(s.ddb, {}))!.clientSecret).toBe(s.clientSecret);
		const env = await resolveConfig(s.ddb, { FEDERATION_GLOBAL_URL: 'https://g.example/', FEDERATION_CLIENT_ID: 'dzc_env', FEDERATION_CLIENT_SECRET: 'dzs_env' });
		expect(env).toMatchObject({ globalUrl: 'https://g.example', source: 'env' });
		// the stored row can never act as a client of this server
		const self = await s.ddb.select().from(linkedAccounts).where(and(eq(linkedAccounts.userId, s.local.id)));
		expect(self).toHaveLength(0);
	});
});
