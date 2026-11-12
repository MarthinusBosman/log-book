/** Opening-hours helpers (client-safe). Days are 'mon'…'sun' as stored on dropzones. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const WEEKDAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

type Hours = { openDays: readonly string[]; openTime: string | null; closeTime: string | null; timezone?: string };

/** Weekday code for `now` in a timezone. */
export function weekdayIn(now: number, timeZone = 'UTC'): (typeof WEEKDAYS)[number] {
	const d = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now).toLowerCase().slice(0, 3);
	return (WEEKDAYS as readonly string[]).includes(d) ? (d as (typeof WEEKDAYS)[number]) : 'mon';
}

/** 'Open today 08:00–17:00' / 'Closed today' (null when no hours are set). */
export function openToday(h: Hours, now = Date.now()): { label: string; tone: 'success' | 'neutral' } | null {
	if (!h.openDays?.length) return null;
	const today = weekdayIn(now, h.timezone);
	if (!h.openDays.includes(today)) return { label: 'Closed today', tone: 'neutral' };
	return { label: h.openTime && h.closeTime ? `Open today ${h.openTime}–${h.closeTime}` : 'Open today', tone: 'success' };
}
