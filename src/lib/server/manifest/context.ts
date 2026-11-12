/**
 * Request helpers shared by the manifest routes: resolve the active dropzone, check capabilities,
 * and turn DomainErrors into form `fail()` payloads with friendly copy.
 */
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { currentMembership, requestDropzone } from '../request-cache.ts';
import { loads, type Dropzone, type Load } from '../db/schema.ts';
import { isDomainError } from '../domain/errors.ts';
import { capabilitiesOf, can } from '../domain/permissions.ts';
import type { Capability, DropzoneRole } from '../../domain/constants.ts';
import { friendlyError } from '../../components/manifest/manifest.ts';

export type DzContext = { dz: Dropzone; roles: DropzoneRole[]; caps: Capability[]; userId: string };

/** Active dropzone (cookie, validated against memberships) with the user's capabilities. */
export async function activeDropzone(event: Pick<RequestEvent, 'locals' | 'cookies' | 'url'>): Promise<DzContext | null> {
	const { locals, cookies, url } = event;
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	const m = await currentMembership({ locals, cookies }, locals.user.id);
	if (!m) return null;
	const dz = await requestDropzone(locals, m.dropzone.id);
	if (!dz) return null;
	return { dz, roles: m.roles, caps: capabilitiesOf(m.roles), userId: locals.user.id };
}

/** Like activeDropzone but 403s without the capability. */
export async function requireDropzone(event: Pick<RequestEvent, 'locals' | 'cookies' | 'url'>, cap: Capability): Promise<DzContext> {
	const ctx = await activeDropzone(event);
	if (!ctx) error(404, 'Join or create a dropzone first');
	if (!ctx.caps.includes(cap) && !(await can(event.locals.db, ctx.userId, ctx.dz.id, cap))) {
		error(403, 'You need a manifest role at this dropzone');
	}
	return ctx;
}

/** Load a load row and check the user has `cap` at the load's dropzone. Throws a DomainError-shaped fail otherwise. */
export async function loadWithCap(event: Pick<RequestEvent, 'locals'>, loadId: string, cap: Capability): Promise<Load> {
	const { locals } = event;
	if (!locals.user) redirect(303, '/login');
	const load = (await locals.db.select().from(loads).where(eq(loads.id, loadId)).limit(1))[0];
	if (!load) throw new ActionFail('not_found', 'That load no longer exists');
	if (!(await can(locals.db, locals.user.id, load.dropzoneId, cap))) throw new ActionFail('forbidden', 'You do not have permission to do that');
	return load;
}

class ActionFail extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message);
	}
}

export type FailData = { message: string; code: string; action?: string; details?: Record<string, unknown> };

/** Run an action body, mapping domain / permission errors to `fail(400|403|404)` with friendly copy. */
export async function runAction<T>(action: string, fn: () => Promise<T>, currency = 'USD') {
	try {
		return await fn();
	} catch (e) {
		if (isDomainError(e) || e instanceof ActionFail) {
			const details = 'details' in e ? (e.details as Record<string, unknown> | undefined) : undefined;
			const status = e.code === 'forbidden' ? 403 : e.code === 'not_found' ? 404 : 400;
			return fail(status, {
				action,
				code: e.code,
				message: friendlyError(e.code, e.message, details, currency),
				details
			} satisfies FailData);
		}
		throw e;
	}
}

// ── form parsing ───────────────────────────────────────────────────────────

export function str(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}
export function optStr(form: FormData, key: string): string | null {
	return str(form, key) || null;
}
export function optNum(form: FormData, key: string): number | null {
	const v = str(form, key);
	if (v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}
export function bool(form: FormData, key: string): boolean {
	const v = form.get(key);
	return v === 'on' || v === 'true' || v === '1';
}
/** Money input in major units ("450" / "450.50") → minor units. */
export function optMoney(form: FormData, key: string): number | null {
	const n = optNum(form, key);
	return n == null ? null : Math.round(n * 100);
}
