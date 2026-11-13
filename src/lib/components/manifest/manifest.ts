/**
 * Client-safe manifest helpers: friendly copy for domain error codes, load-status flow,
 * call-timer phases and formatting. No server imports.
 */
import { formatMoney, type LoadStatus } from '../../domain/constants.ts';

export function friendlyError(code: string, message: string, details?: Record<string, unknown>, currency = 'USD'): string {
	switch (code) {
		case 'load_full':
			return details && typeof details.free === 'number'
				? `Not enough space — only ${details.free} slot${details.free === 1 ? '' : 's'} left on this load.`
				: 'Sorry, there are no more slots available on this load.';
		case 'overweight':
			return details && typeof details.weightKg === 'number'
				? `Too heavy — that would put the load at ${details.weightKg} kg (limit ${details.weightLimitKg} kg, pilot included).`
				: 'That would exceed the aircraft weight limit.';
		case 'already_on_load':
			return message === 'Already on load' ? 'Already on load — that jumper is already on this load.' : message;
		case 'load_locked':
			return message.endsWith('.') ? message : `${message}.`;
		case 'insufficient_funds': {
			const a = Number(details?.availableMinor ?? NaN);
			const r = Number(details?.requiredMinor ?? NaN);
			const cur = String(details?.currency ?? currency);
			return Number.isFinite(a) && Number.isFinite(r)
				? `Insufficient wallet funds — available ${formatMoney(a, cur)}, slot costs ${formatMoney(r, cur)}. Tick “Pay at manifest” to skip the wallet.`
				: 'Insufficient wallet funds. Tick “Pay at manifest” to skip the wallet.';
		}
		case 'membership_expired':
			return `${message}. Tick “Allow expired membership” to manifest anyway.`;
		case 'not_checked_in':
			return `${message}. Check them in first.`;
		case 'invalid_transition':
			return message;
		case 'forbidden':
			return 'You do not have permission to do that.';
		case 'not_found':
			return message || 'Not found.';
		default:
			return message || 'Something went wrong.';
	}
}

/** The single "next step" button on a load card. */
export type NextStep = { action: string; label: string; tone: 'primary' | 'warning' | 'success' };
export function nextStep(status: LoadStatus): NextStep | null {
	switch (status) {
		case 'planned':
		case 'open':
			return { action: 'call', label: '20 min call', tone: 'primary' };
		case 'called':
			return { action: 'board', label: 'Gear up & go', tone: 'warning' };
		case 'boarding':
			return { action: 'depart', label: 'Departed', tone: 'primary' };
		case 'departed':
			return { action: 'land', label: 'Landed', tone: 'primary' };
		case 'landed':
			return { action: 'complete', label: 'Complete load', tone: 'success' };
		default:
			return null;
	}
}

export const ACTIVE_STATUSES: readonly LoadStatus[] = ['planned', 'open', 'called', 'boarding'];

/** Hangar display phase from the call timer. */
export type CallPhase = 'none' | 'call20' | 'call10' | 'call5' | 'gearup' | 'boarding' | 'airborne';
export function callPhase(status: LoadStatus, callDueAt: number | null, now: number): CallPhase {
	if (status === 'boarding') return 'boarding';
	if (status === 'departed' || status === 'landed') return 'airborne';
	if (status !== 'called' || callDueAt == null) return 'none';
	const left = callDueAt - now;
	if (left <= 0) return 'gearup';
	if (left <= 5 * 60_000) return 'call5';
	if (left <= 10 * 60_000) return 'call10';
	return 'call20';
}
export const CALL_PHASE_LABELS: Record<CallPhase, string> = {
	none: '',
	call20: '20 min call',
	call10: '10 min call',
	call5: '5 min call',
	gearup: 'Gear up',
	boarding: 'Gear up & go',
	airborne: 'In the air'
};

/** "12:34" countdown (negative → "+0:12" overdue). */
export function formatCountdown(ms: number): string {
	const neg = ms < 0;
	const s = Math.floor(Math.abs(ms) / 1000);
	const m = Math.floor(s / 60);
	const r = String(s % 60).padStart(2, '0');
	return `${neg ? '+' : ''}${m}:${r}`;
}

/** `HH:MM` in a timezone (client + server render identically). */
export function clockTime(at: number | null | undefined, timeZone: string): string {
	if (at == null) return '';
	try {
		return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
	} catch {
		return new Date(at).toISOString().slice(11, 16);
	}
}

export function prettyDay(day: string, today: string): string {
	if (day === today) return 'Today';
	const d = new Date(`${day}T12:00:00Z`);
	return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

export function shiftDay(day: string, days: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Stable hue for a jump group so grouped slots share a colour stripe. */
export function groupHue(id: string): number {
	return [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
}

/**
 * Money summary for a load's slots. Wallet-held slots are charged automatically when the load
 * completes, so they are NOT outstanding: only unpaid slots without a hold are.
 */
export function slotMoney(slots: readonly { totalMinor: number; paid: boolean; held: boolean }[]) {
	let totalMinor = 0;
	let heldMinor = 0;
	let outstandingMinor = 0;
	for (const s of slots) {
		totalMinor += s.totalMinor;
		if (s.paid || s.totalMinor <= 0) continue;
		if (s.held) heldMinor += s.totalMinor;
		else outstandingMinor += s.totalMinor;
	}
	return { totalMinor, heldMinor, outstandingMinor };
}

/**
 * Ask `message` via `ask` (window.confirm in the browser); true when the user agreed or there's
 * nothing to ask. Used by `act({ confirm })` so "Cancel" really cancels the enhanced submit.
 */
export function confirmed(message: string | (() => string) | undefined, ask: (m: string) => boolean = (m) => window.confirm(m)): boolean {
	const m = typeof message === 'function' ? message() : message;
	return !m || ask(m);
}
