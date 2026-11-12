import { error, fail, redirect } from '@sveltejs/kit';
import { count, eq, like, not } from 'drizzle-orm';
import { instances, linkedAccounts, users } from '#lib/server/db/schema.ts';
import { instanceMode, publicOrigin } from '#lib/server/config.ts';
import { GRANT_ISSUER_PREFIX, outboxStats } from '#lib/server/domain/federation.ts';
import { DZ_COOKIE, listMemberships } from '#lib/server/dropzones/index.ts';
import { can } from '#lib/server/domain/permissions.ts';
import { listInstances, OAuthError, registerInstance, rotateSecret, setInstanceStatus } from '#lib/server/import/federation/server.ts';
import { CALLBACK_PATH, clearStoredConfig, FederationError, flushOutbox, saveStoredConfig, testConnection } from '#lib/server/import/federation/client.ts';
import { canManageFederation, fedConfig } from '#lib/server/import/federation/web.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

async function guard(event: Pick<RequestEvent, 'locals'>) {
	const user = event.locals.user;
	if (!user) redirect(303, '/login');
	if (!(await canManageFederation(event.locals.db, user.id))) error(403, 'Only dropzone owners and admins can manage federation.');
	return user;
}

async function isSuper(event: Pick<RequestEvent, 'locals'>) {
	const u = (await event.locals.db.select({ su: users.isSuperAdmin }).from(users).where(eq(users.id, event.locals.user!.id)).limit(1))[0];
	return !!u?.su;
}

async function ownInstance(event: Pick<RequestEvent, 'locals'>, id: string) {
	const row = (await event.locals.db.select().from(instances).where(eq(instances.id, id)).limit(1))[0];
	if (!row || (row.createdBy !== event.locals.user!.id && !(await isSuper(event)))) error(404, 'Instance not found');
	return row;
}

export const load: PageServerLoad = async (event) => {
	await guard(event);
	const db = event.locals.db;
	const mode = instanceMode();
	if (mode === 'global') {
		const all = await isSuper(event);
		const list = (await listInstances(db, all ? {} : { createdBy: event.locals.user!.id })).map((i) => ({
			id: i.id,
			name: i.name,
			origin: i.origin,
			redirectUris: i.redirectUris,
			clientId: i.clientId,
			status: i.status,
			createdAt: i.createdAt,
			linkedUsers: i.linkedUsers
		}));
		return { mode, instances: list.filter((i) => i.id !== 'federation-self') };
	}
	const cfg = await fedConfig(db);
	const [linked] = await db
		.select({ n: count() })
		.from(linkedAccounts)
		.where(not(like(linkedAccounts.issuer, `${GRANT_ISSUER_PREFIX}%`)));
	return {
		mode,
		config: cfg ? { source: cfg.source, globalUrl: cfg.globalUrl, clientId: cfg.clientId, secretHint: `${cfg.clientSecret.slice(0, 8)}…` } : null,
		redirectUri: publicOrigin(event.url.origin) + CALLBACK_PATH,
		origin: publicOrigin(event.url.origin),
		stats: await outboxStats(db),
		linkedUsers: linked.n
	};
};

export const actions: Actions = {
	// ── global ──
	register: async (event) => {
		const user = await guard(event);
		if (instanceMode() !== 'global') error(404);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const origin = String(form.get('origin') ?? '').trim();
		const redirectUri = String(form.get('redirectUri') ?? '').trim() || (origin ? origin.replace(/\/+$/, '') + CALLBACK_PATH : '');
		if (name.length < 2) return fail(400, { name, origin, redirectUri, message: 'Give the instance a name.' });
		const memberships = await listMemberships(event.locals.db, user.id);
		const m = memberships.find((x) => x.dropzone.slug === event.cookies.get(DZ_COOKIE)) ?? memberships[0];
		const dropzoneId = m && (await can(event.locals.db, user.id, m.dropzone.id, 'dz.settings')) ? m.dropzone.id : null;
		try {
			const r = await registerInstance(event.locals.db, { name, origin, redirectUris: [redirectUri], dropzoneId, createdBy: user.id });
			return { created: { name: r.instance.name, clientId: r.instance.clientId, clientSecret: r.clientSecret, globalUrl: publicOrigin(event.url.origin) } };
		} catch (e) {
			if (e instanceof OAuthError) return fail(400, { name, origin, redirectUri, message: e.description });
			throw e;
		}
	},
	rotate: async (event) => {
		await guard(event);
		const form = await event.request.formData();
		const inst = await ownInstance(event, String(form.get('id')));
		const clientSecret = await rotateSecret(event.locals.db, inst.id);
		return { created: { name: inst.name, clientId: inst.clientId, clientSecret, globalUrl: publicOrigin(event.url.origin) } };
	},
	status: async (event) => {
		await guard(event);
		const form = await event.request.formData();
		const inst = await ownInstance(event, String(form.get('id')));
		const status = String(form.get('status'));
		if (status !== 'active' && status !== 'suspended' && status !== 'revoked') return fail(400, { message: 'Bad status' });
		await setInstanceStatus(event.locals.db, inst.id, status);
		return { done: `${inst.name} is now ${status}.` };
	},
	// ── dropzone ──
	save: async (event) => {
		const user = await guard(event);
		if (instanceMode() !== 'dropzone') error(404);
		const cfg = await fedConfig(event.locals.db);
		if (cfg?.source === 'env') return fail(400, { message: 'Federation is configured by environment variables on this server.' });
		const form = await event.request.formData();
		try {
			await saveStoredConfig(event.locals.db, {
				globalUrl: String(form.get('globalUrl') ?? ''),
				clientId: String(form.get('clientId') ?? ''),
				clientSecret: String(form.get('clientSecret') ?? ''),
				name: 'Global instance',
				createdBy: user.id
			});
		} catch (e) {
			if (e instanceof FederationError) return fail(400, { message: e.message, globalUrl: String(form.get('globalUrl') ?? ''), clientId: String(form.get('clientId') ?? '') });
			throw e;
		}
		const fresh = await fedConfig(event.locals.db);
		const t = fresh ? await testConnection(fresh) : { ok: false, message: '' };
		return { done: t.ok ? 'Saved. ' + t.message : 'Saved, but: ' + t.message };
	},
	clear: async (event) => {
		await guard(event);
		await clearStoredConfig(event.locals.db);
		return { done: 'Federation settings removed.' };
	},
	test: async (event) => {
		await guard(event);
		const cfg = await fedConfig(event.locals.db);
		if (!cfg) return fail(400, { message: 'Not configured yet.' });
		const t = await testConnection(cfg);
		return t.ok ? { done: t.message } : fail(502, { message: t.message });
	},
	flush: async (event) => {
		await guard(event);
		const cfg = await fedConfig(event.locals.db);
		if (!cfg) return fail(400, { message: 'Not configured yet.' });
		const r = await flushOutbox(event.locals.db, cfg);
		if (r.failed && !r.sent) return fail(502, { message: `Nothing sent: ${r.error ?? 'the global instance refused the items'}.` });
		return { done: `Sent ${r.sent}${r.failed ? `, ${r.failed} will retry` : ''}${r.dropped ? `, ${r.dropped} dropped (unlinked)` : ''}.` };
	}
};

