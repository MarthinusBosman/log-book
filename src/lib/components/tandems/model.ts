/** Client-safe tandem/waiver vocabulary for the UI (no server imports). */
import type { BadgeTone } from '#lib/ui/Badge.svelte';
import type { IndemnitySectionType, PaymentStatus, SlotExtra, TandemStatus } from '#lib/domain/constants.ts';

/** Display stage derived from status + payment + indemnity (the booking's journey). */
export type TandemStage = 'booked' | 'deposit_paid' | 'signed' | 'manifested' | 'jumped' | 'cancelled';

export const STAGE_LABELS: Record<TandemStage, string> = {
	booked: 'Booked',
	deposit_paid: 'Deposit paid',
	signed: 'Indemnity signed',
	manifested: 'Manifested',
	jumped: 'Jumped',
	cancelled: 'Cancelled'
};

export const STAGE_TONES: Record<TandemStage, BadgeTone> = {
	booked: 'neutral',
	deposit_paid: 'warning',
	signed: 'brand',
	manifested: 'brand',
	jumped: 'success',
	cancelled: 'danger'
};

export const STAGE_ORDER: TandemStage[] = ['booked', 'deposit_paid', 'signed', 'manifested', 'jumped'];

type StageInput = {
	status: TandemStatus;
	paymentStatus: PaymentStatus;
	manifested: boolean;
	indemnitySignedAt: Date | string | null;
};

export function tandemStage(p: StageInput): TandemStage {
	if (p.status === 'cancelled') return 'cancelled';
	if (p.status === 'completed') return 'jumped';
	if (p.manifested || p.status === 'manifested') return 'manifested';
	if (p.indemnitySignedAt) return 'signed';
	if (p.paymentStatus !== 'unpaid') return 'deposit_paid';
	return 'booked';
}

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
	unpaid: 'Unpaid',
	deposit_paid: 'Deposit paid',
	partially_paid: 'Part paid',
	paid: 'Paid',
	refunded: 'Refunded'
};
export const PAYMENT_TONES: Record<PaymentStatus, BadgeTone> = {
	unpaid: 'danger',
	deposit_paid: 'warning',
	partially_paid: 'warning',
	paid: 'success',
	refunded: 'neutral'
};

export const MANUAL_METHODS = [
	{ value: 'cash', label: 'Cash' },
	{ value: 'card', label: 'Card' },
	{ value: 'eft', label: 'EFT' },
	{ value: 'manual', label: 'Other / manual' }
];

/** Customer-facing add-on copy (original "Jump Info" step). */
export const EXTRA_COPY: Record<SlotExtra, { title: string; blurb: string }> = {
	handcam: { title: 'Handcam video & photos', blurb: 'Your instructor films the whole skydive from a wrist camera.' },
	outside_video: { title: 'Outside video', blurb: 'Another skydiver jumps with you and films from the outside.' },
	extreme_ride: { title: 'Extreme canopy ride', blurb: 'Spirals and turns under the parachute — for thrill seekers.' },
	beach_landing: { title: 'Beach landing', blurb: 'Land on the beach instead of the dropzone.' },
	extra_altitude: { title: 'Extra altitude', blurb: 'Longer freefall time.' },
	max_altitude: { title: 'Max altitude', blurb: 'The highest jump we offer!' },
	gear_rental: { title: 'Gear rental', blurb: '' },
	special_event: { title: 'Special event', blurb: '' }
};

/** Price-list code for a tandem extra. */
export const TANDEM_EXTRA_PRICE_CODE: Partial<Record<SlotExtra, string>> = {
	handcam: 'tandem_handcam',
	outside_video: 'tandem_outside_video',
	extreme_ride: 'tandem_extreme_ride',
	beach_landing: 'tandem_beach_landing',
	extra_altitude: 'tandem_extra_altitude',
	max_altitude: 'tandem_max_altitude'
};

export const SECTION_TYPE_LABELS: Record<IndemnitySectionType, string> = {
	text: 'Text (read only)',
	acknowledgement: 'Checkbox — must accept',
	initials: 'Initials',
	signature: 'Extra signature'
};

/** Default tandem limits; a DZ can override via settings.tandemMaxWeightKg / tandemMaxHeightCm. */
export const DEFAULT_TANDEM_LIMITS = { maxWeightKg: 100, warnWeightKg: 95, minHeightCm: 140, maxHeightCm: 200 };
export type TandemLimits = typeof DEFAULT_TANDEM_LIMITS;

export function limitWarnings(p: { weightKg?: number | null; heightCm?: number | null }, l: TandemLimits = DEFAULT_TANDEM_LIMITS): string[] {
	const out: string[] = [];
	if (p.weightKg != null && p.weightKg > l.maxWeightKg) out.push(`Weight ${p.weightKg} kg is over the ${l.maxWeightKg} kg tandem limit`);
	else if (p.weightKg != null && p.weightKg > l.warnWeightKg) out.push(`Weight ${p.weightKg} kg is close to the ${l.maxWeightKg} kg limit`);
	if (p.heightCm != null && (p.heightCm < l.minHeightCm || p.heightCm > l.maxHeightCm)) {
		out.push(`Height ${p.heightCm} cm is outside ${l.minHeightCm}–${l.maxHeightCm} cm`);
	}
	return out;
}

export function ageOn(dob: string, on: string): number {
	const [y1, m1, d1] = dob.split('-').map(Number);
	const [y2, m2, d2] = on.split('-').map(Number);
	return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

export function fmtDay(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T00:00:00Z`));
}

/** Spoken name for a booking-calendar day: "Saturday 14 November, 1 place left" (not the ISO date). */
export function calendarDayLabel(date: string, placesLeft: number): string {
	const day = fmtDay(date, { weekday: 'long', day: 'numeric', month: 'long' });
	return placesLeft > 0 ? `${day}, ${placesLeft} ${placesLeft === 1 ? 'place' : 'places'} left` : `${day}, unavailable`;
}

/** Accessible name for an extras toggle: "Add Video for Thandi Nkosi" (single jumper: "Add Video"). */
export function extraToggleLabel(extraTitle: string, jumperName: string | null): string {
	return jumperName ? `Add ${extraTitle} for ${jumperName}` : `Add ${extraTitle}`;
}

export function addDaysIso(date: string, days: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
