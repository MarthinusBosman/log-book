/**
 * Staff back-office request context: resolves the active dropzone (same rule as the /app layout:
 * `dz` cookie among active memberships, else the first) and enforces capabilities.
 */
import { error, fail, redirect, type ActionFailure, type Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { dropzones, type Dropzone } from '#lib/server/db/schema.ts';
import { DZ_COOKIE, listMemberships } from '#lib/server/dropzones/index.ts';
import { capabilitiesOf } from '#lib/server/domain/permissions.ts';
import { isDomainError } from '#lib/server/domain/errors.ts';
import { localDate } from '#lib/server/domain/time.ts';
import type { Capability, DropzoneRole } from '#lib/domain/constants.ts';

type Ev = { locals: App.Locals; cookies: Cookies; url: URL };

export type StaffCtx = {
	user: NonNullable<App.Locals['user']>;
	dz: Dropzone;
	roles: DropzoneRole[];
	caps: Capability[];
	today: string;
	can: (cap: Capability) => boolean;
};

const CAP_LABELS: Record<Capability, string> = {
	'dz.settings': 'manage dropzone settings',
	'staff.manage': 'manage staff and roles',
	'pricing.manage': 'edit the price list',
	manifest: 'manifest loads',
	'checkin.manage': 'check jumpers in',
	'tandems.manage': 'manage tandems',
	'teams.manage': 'manage teams',
	'payments.manage': 'manage payments and wallets',
	'gear.manage': 'manage gear',
	'aircraft.manage': 'manage aircraft',
	'indemnity.manage': 'manage waivers',
	'reports.view': 'view reports',
	'loads.view': 'view loads'
};

export async function resolveCtx(event: Ev): Promise<StaffCtx | null> {
	const user = event.locals.user;
	if (!user) redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	const memberships = await listMemberships(event.locals.db, user.id);
	const selected = event.cookies.get(DZ_COOKIE);
	const m = memberships.find((x) => x.dropzone.slug === selected) ?? memberships[0];
	if (!m) return null;
	const dz = (await event.locals.db.select().from(dropzones).where(eq(dropzones.id, m.dropzone.id)).limit(1))[0];
	if (!dz) return null;
	const caps = capabilitiesOf(m.roles);
	return {
		user,
		dz,
		roles: m.roles,
		caps,
		today: localDate(Date.now(), dz.timezone),
		can: (cap) => caps.includes(cap)
	};
}

export function deniedMessage(caps: Capability[]): string {
	return `You need permission to ${caps.map((c) => CAP_LABELS[c]).join(' or ')} at this dropzone. Ask an owner or admin if this is a mistake.`;
}

/** For `load`: returns the context or throws a friendly 403/404 (rendered by the section's +error.svelte). */
export async function requirePage(event: Ev, ...anyOf: Capability[]): Promise<StaffCtx> {
	const ctx = await resolveCtx(event);
	if (!ctx) error(404, 'Select or create a dropzone first.');
	if (anyOf.length && !anyOf.some((c) => ctx.can(c))) error(403, deniedMessage(anyOf));
	return ctx;
}

export type ActionResult<T> = T | ActionFailure<{ message: string; code?: string }>;

/**
 * For form actions: checks the capability, runs `fn`, and maps domain errors to `fail(400|403)`
 * with a friendly message. Non-domain errors (incl. redirects) are rethrown.
 */
export async function runAction<T>(event: Ev, cap: Capability | Capability[], fn: (ctx: StaffCtx) => Promise<T>) {
	const ctx = await resolveCtx(event);
	if (!ctx) return fail(400, { message: 'Select or create a dropzone first.' });
	const caps = Array.isArray(cap) ? cap : [cap];
	if (!caps.some((c) => ctx.can(c))) return fail(403, { message: deniedMessage(caps) });
	try {
		return await fn(ctx);
	} catch (e) {
		if (isDomainError(e)) return fail(e.code === 'forbidden' ? 403 : 400, { message: e.message, code: e.code as string });
		throw e;
	}
}

/** Form helpers */
export const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
export const optStr = (f: FormData, k: string) => str(f, k) || null;
export const bool = (f: FormData, k: string) => {
	const v = f.get(k);
	return v === 'on' || v === 'true' || v === '1';
};
export function optNum(f: FormData, k: string): number | null | 'invalid' {
	const s = str(f, k);
	if (!s) return null;
	const n = Number(s.replace(',', '.'));
	return Number.isFinite(n) ? n : 'invalid';
}

/** `from`/`to` query params (YYYY-MM-DD), defaulting to the last `days` days ending today. */
export function rangeFromUrl(url: URL, today: string, days = 30): { from: string; to: string } {
	const re = /^\d{4}-\d{2}-\d{2}$/;
	const toQ = url.searchParams.get('to');
	const fromQ = url.searchParams.get('from');
	const to = toQ && re.test(toQ) ? toQ : today;
	const back = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
	let from = fromQ && re.test(fromQ) ? fromQ : back;
	if (from > to) from = to;
	return { from, to };
}
