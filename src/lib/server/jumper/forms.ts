import { error, fail, redirect } from '@sveltejs/kit';
import { formatMoney } from '../../domain/constants.ts';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones } from '../db/schema.ts';
import { localDate } from '../domain/time.ts';
import { isDomainError, type DomainError } from '../domain/errors.ts';

/** The signed-in user or a redirect to login (every jumper load/action starts with this). */
export function requireUser(locals: App.Locals, url?: URL) {
	if (!locals.user) {
		redirect(303, url ? `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}` : '/login');
	}
	return locals.user;
}

/** Friendly copy for domain error codes (mirrors the original app's dialogs). */
export function friendlyError(e: DomainError): string {
	const d = (e.details ?? {}) as Record<string, unknown>;
	switch (e.code) {
		case 'insufficient_funds': {
			const cur = String(d.currency ?? '');
			const avail = typeof d.availableMinor === 'number' && cur ? formatMoney(d.availableMinor, cur) : null;
			return avail
				? `You do not have enough money in your wallet for this jump. Available funds: ${avail}. Top up your wallet or pay at manifest.`
				: 'You do not have enough money in your wallet for this jump.';
		}
		case 'load_full':
			return 'Sorry, you missed out. There are no more slots available on this load.';
		case 'overweight':
			return 'This load is at its weight limit. Try the next load.';
		case 'load_locked':
			return e.message === 'This load is not open for jumpers'
				? 'This load isn’t open for self-manifest. Ask manifest to add you.'
				: 'This load is closed for changes.';
		case 'already_on_load':
			return 'You are already jumping on this load.';
		case 'membership_expired':
			return `${e.message}. Renew your association membership and update the expiry date in your profile.`;
		case 'not_checked_in':
			return 'You need to check in at the dropzone before you can join a load.';
		case 'wallet_disabled':
			return 'The wallet isn’t enabled at this dropzone. Please pay at manifest.';
		case 'currency_mismatch':
			return `${e.message}. Please talk to manifest.`;
		case 'cannot_sign_own_jump':
			return 'You can’t sign your own jump. Ask an instructor or another licensed jumper.';
		case 'signer_not_licensed':
			return 'Only licensed jumpers can sign jumps. Add your licence number in your profile first.';
		case 'forbidden':
			return 'You don’t have permission to do that.';
		case 'not_found':
			return e.message.endsWith('not found') ? `${e.message.replace(/ not found$/, '')} not found. It may have been removed.` : e.message;
		default:
			return e.message;
	}
}

/** Turn a DomainError into `fail(400)` with a friendly message; rethrow anything else. */
export function domainFail<T extends Record<string, unknown>>(e: unknown, extra?: T) {
	if (isDomainError(e)) {
		return fail(e.code === 'forbidden' ? 403 : e.code === 'not_found' ? 404 : 400, {
			...(extra ?? ({} as T)),
			message: friendlyError(e),
			code: e.code
		});
	}
	throw e;
}

/** For loads: map a DomainError to an HTTP error page (404/403), rethrow anything else. */
export function domainError(e: unknown): never {
	if (isDomainError(e, 'not_found')) error(404, e.message);
	if (isDomainError(e, 'forbidden')) error(403, e.message);
	throw e;
}

// ── form field parsing ─────────────────────────────────────────────────────

export function str(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}
/** Trimmed string or null when empty. */
export function opt(form: FormData, key: string): string | null {
	return str(form, key) || null;
}
/** Number or null when empty; NaN when not a number (let the domain validate). */
export function num(form: FormData, key: string): number | null {
	const v = str(form, key).replace(',', '.');
	if (!v) return null;
	return Number(v);
}
export function int(form: FormData, key: string): number | null {
	const n = num(form, key);
	return n === null ? null : Number.isFinite(n) ? Math.round(n) : NaN;
}
export function bool(form: FormData, key: string): boolean {
	const v = form.get(key);
	return v === 'on' || v === 'true' || v === '1';
}
/** Parse a money input ("450", "450.50", "R 450,5") into minor units; NaN when invalid. */
export function moneyMinor(form: FormData, key: string): number {
	const raw = str(form, key).replace(/[^\d.,]/g, '').replace(',', '.');
	if (!raw) return NaN;
	const n = Number(raw);
	return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
/** "mm:ss" or plain seconds → seconds (null when empty). */
export function seconds(form: FormData, key: string): number | null {
	const v = str(form, key);
	if (!v) return null;
	const m = /^(\d+):([0-5]?\d)$/.exec(v);
	if (m) return Number(m[1]) * 60 + Number(m[2]);
	const n = Number(v);
	return Number.isFinite(n) ? Math.round(n) : NaN;
}

/** Today's calendar date at a dropzone (its timezone), or UTC without one. */
export async function todayAt(db: Database, dropzoneId: string | null | undefined, now = Date.now()): Promise<string> {
	const tz = dropzoneId ? (await db.select({ tz: dropzones.timezone }).from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1))[0]?.tz : undefined;
	return localDate(now, tz ?? 'UTC');
}
