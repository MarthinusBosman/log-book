/** Client-safe display helpers for the jumper area. */
import type { DueStatus } from '#lib/domain/constants.ts';
import type { BadgeTone } from '#lib/ui/Badge.svelte';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → '14 Nov 2026' (no timezone shifts: it's a calendar date). */
export function fmtDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
	if (!iso) return '—';
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!m) return iso;
	const s = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
	return opts.year === false ? s : `${s} ${m[1]}`;
}

/** Instant → '14 Nov 2026, 09:05' in the given timezone (defaults to the runtime's). */
export function fmtDateTime(d: Date | string | number | null | undefined, timeZone?: string): string {
	if (d === null || d === undefined) return '—';
	const date = d instanceof Date ? d : new Date(d);
	return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date);
}

export function fmtTime(d: Date | string | number | null | undefined, timeZone?: string): string {
	if (d === null || d === undefined) return '';
	const date = d instanceof Date ? d : new Date(d);
	return new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date);
}

/** '3 min ago', 'yesterday', '12 Nov'. */
export function relativeTime(d: Date | string | number, now = Date.now()): string {
	const t = (d instanceof Date ? d : new Date(d)).getTime();
	const s = Math.round((now - t) / 1000);
	if (s < 45) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} h ago`;
	const days = Math.round(h / 24);
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days} days ago`;
	return fmtDate(new Date(t).toISOString().slice(0, 10), { year: days > 300 });
}

/** Freefall seconds → '45s', '12m 05s', '3h 02m'. */
export function fmtFreefall(sec: number | null | undefined): string {
	if (!sec) return '0s';
	if (sec < 60) return `${sec}s`;
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

export function fmtNumber(n: number | null | undefined): string {
	return n === null || n === undefined ? '—' : new Intl.NumberFormat('en-ZA').format(n);
}

export const DUE_TONES: Record<DueStatus, BadgeTone> = { ok: 'success', due_soon: 'warning', overdue: 'danger', unknown: 'neutral' };

/** 'Due in 12 days' / 'Overdue by 3 days' / 'Valid · 120 days'. */
export function dueLabel(info: { status: DueStatus; daysLeft: number | null }, words: { ok?: string; soon?: string } = {}): string {
	const d = info.daysLeft;
	switch (info.status) {
		case 'overdue':
			return d === null ? 'Overdue' : `Overdue by ${-d} day${d === -1 ? '' : 's'}`;
		case 'due_soon':
			return d === 0 ? `${words.soon ?? 'Due'} today` : `${words.soon ?? 'Due'} in ${d} day${d === 1 ? '' : 's'}`;
		case 'ok':
			return `${words.ok ?? 'OK'} · ${d} days`;
		default:
			return 'Not set';
	}
}

/** Countdown text for a future instant: '12:04' (mm:ss) or '1h 05m'; null when past. */
export function countdown(target: number, now: number): string | null {
	const s = Math.floor((target - now) / 1000);
	if (s <= 0) return null;
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
	return `${m}:${String(s % 60).padStart(2, '0')}`;
}
