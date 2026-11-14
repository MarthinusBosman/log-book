/** Route helpers for the tandems / booking / waivers area (server only). */
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { currentMembership, requestDropzone } from '../request-cache.ts';
import type { Dropzone, TandemPassenger } from '../db/schema.ts';
import type { Capability } from '../../domain/constants.ts';
import { SLOT_EXTRA_LABELS, formatMoney } from '../../domain/constants.ts';
import { actorCan } from '../domain/permissions.ts';
import { getDropzone } from '../domain/dropzone-admin.ts';
import { isDomainError, type DomainErrorCode } from '../domain/errors.ts';
import { tandemOutstanding } from '../domain/tandems.ts';
import { getMailer } from '../email/index.ts';
import { brand } from '../../brand.ts';
import { parseMoney } from '../../components/staffadmin/money.ts';
import { formatDay } from './documents.ts';

/** Friendly copy for domain error codes (the service message is used when more specific). */
const FRIENDLY: Partial<Record<DomainErrorCode, string>> = {
	forbidden: "You don't have permission to do that at this dropzone.",
	not_found: "We couldn't find that — it may have been removed.",
	load_full: 'That load is full. Pick another load or free up a slot.',
	overweight: 'That would put the load over its weight limit.',
	load_locked: 'That load has already left or closed — choose another load.',
	already_on_load: 'That person is already on this load.',
	booking_full: 'Sorry, that time just filled up. Please pick another time.',
	insufficient_funds: "A staff member's wallet doesn't cover this slot.",
	membership_expired: "A staff member's membership has expired.",
	not_checked_in: 'Staff need to be checked in before they can be manifested.'
};

export function friendlyMessage(e: unknown): string {
	if (!isDomainError(e)) return 'Something went wrong. Please try again.';
	if (['invalid', 'conflict', 'invalid_transition', 'booking_full', 'not_found'].includes(e.code)) return e.message;
	return FRIENDLY[e.code] ?? e.message;
}

/** Turn a DomainError into an ActionFailure; rethrow anything else. */
export function failFrom(e: unknown, extra: Record<string, unknown> = {}) {
	if (isDomainError(e)) return fail(e.code === 'forbidden' ? 403 : 400, { message: friendlyMessage(e), code: e.code, ...extra });
	throw e;
}

export type StaffContext = { userId: string; dz: Dropzone };

/** Active dropzone (same rule as the /app layout) + capability check. Works in loads and actions. */
export async function staffContext(event: RequestEvent, capability: Capability | Capability[]): Promise<StaffContext> {
	const user = event.locals.user;
	if (!user) redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	const current = await currentMembership(event, user.id);
	if (!current) error(403, 'Join or create a dropzone first.');
	const caps = Array.isArray(capability) ? capability : [capability];
	// The role list already answers most checks; the session user carries the super-admin flag.
	const ok = actorCan(user, current.roles, caps);
	if (!ok) error(403, 'You need a staff role with access to this page at the selected dropzone.');
	return { userId: user.id, dz: (await requestDropzone(event.locals, current.dropzone.id)) ?? (await getDropzone(event.locals.db, current.dropzone.id)) };
}

export const str = (f: FormData, k: string): string => String(f.get(k) ?? '').trim();
export const optStr = (f: FormData, k: string): string | null => str(f, k) || null;
export function optNum(f: FormData, k: string): number | null {
	const v = str(f, k);
	if (!v) return null;
	const n = Number(v.replace(',', '.'));
	return Number.isFinite(n) ? n : null;
}
/** "1 250.50" / "450,50" → minor units; null when blank, NaN when not a valid positive amount. */
export function moneyToMinor(v: string): number | null {
	if (!v.trim()) return null;
	return parseMoney(v) ?? NaN;
}

export function publicOrigin(url: URL, configured?: string): string {
	return (configured || url.origin).replace(/\/$/, '');
}

export function confirmationUrl(origin: string, dz: Pick<Dropzone, 'slug'>, p: Pick<TandemPassenger, 'confirmationNumber'>) {
	return `${origin}/dz/${dz.slug}/book/${p.confirmationNumber}`;
}

/** Booking confirmation email (Mailer interface; console in dev). */
export async function sendConfirmationEmail(dz: Dropzone, p: TandemPassenger, origin: string): Promise<boolean> {
	if (!p.email) return false;
	const link = confirmationUrl(origin, dz, p);
	const extras = p.extras.map((e) => SLOT_EXTRA_LABELS[e]).join(', ');
	const lines = [
		`Hi ${p.name.split(' ')[0]},`,
		'',
		`Your tandem skydive at ${dz.name} is booked!`,
		'',
		`Confirmation number: ${p.confirmationNumber}`,
		`Date: ${p.jumpDate ? formatDay(p.jumpDate) : 'to be confirmed'}${p.bookingTime ? ` at ${p.bookingTime}` : ''}`,
		extras ? `Add-ons: ${extras}` : null,
		`Total: ${formatMoney(p.totalMinor, p.currency)} · Paid: ${formatMoney(p.amountPaidMinor, p.currency)} · Due: ${formatMoney(tandemOutstanding(p), p.currency)}`,
		'',
		`View your booking and download the confirmation PDF: ${link}`,
		p.indemnitySignedAt ? null : `Please sign your indemnity before the jump: ${link}#indemnity`,
		'',
		dz.address ? `Where: ${dz.address}` : null,
		dz.contactPhone ? `Questions? Call ${dz.contactPhone}` : null,
		'',
		`Blue skies,\n${dz.name}`,
		`— sent by ${brand.name}`
	].filter((l) => l !== null);
	await getMailer().send({ to: p.email, subject: `Your tandem skydive at ${dz.name} — ${p.confirmationNumber}`, text: lines.join('\n') });
	return true;
}

/** Notify the DZ inbox of a new online booking ("tandem-booking-admin"). */
export async function sendAdminBookingEmail(dz: Dropzone, p: TandemPassenger, origin: string): Promise<void> {
	if (!dz.emailNotices || !dz.contactEmail) return;
	await getMailer().send({
		to: dz.contactEmail,
		subject: `New tandem booking: ${p.name} (${p.jumpDate ?? 'no date'} ${p.bookingTime ?? ''})`,
		text: `${p.name} <${p.email ?? '-'}> booked a tandem for ${p.jumpDate ?? '?'} ${p.bookingTime ?? ''}.\nConfirmation: ${p.confirmationNumber}\nManage: ${origin}/app/tandems?day=${p.jumpDate ?? ''}&p=${p.id}`
	});
}

export function pdfResponse(bytes: Uint8Array, filename: string, inline = true): Response {
	return new Response(bytes as unknown as BodyInit, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/[^\w.-]+/g, '_')}"`,
			'Cache-Control': 'private, no-store'
		}
	});
}
