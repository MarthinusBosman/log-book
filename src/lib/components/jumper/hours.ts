/** Opening-hours helpers (client-safe). Days are 'mon'…'sun' as stored on dropzones. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const WEEKDAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const WEEKDAY_NAMES: Record<(typeof WEEKDAYS)[number], string> = {
	mon: 'Monday',
	tue: 'Tuesday',
	wed: 'Wednesday',
	thu: 'Thursday',
	fri: 'Friday',
	sat: 'Saturday',
	sun: 'Sunday'
};

/**
 * Opening days as a sentence ('Open Wednesday, Saturday and Sunday', 'Open every day'): the
 * text alternative for the colour-coded weekday grids, which screen readers otherwise read as
 * a bare 'Mon Tue Wed …' with no hint of which days are open.
 */
export function openDaysText(openDays: readonly string[]): string {
	const names = WEEKDAYS.filter((d) => openDays.includes(d)).map((d) => WEEKDAY_NAMES[d]);
	if (!names.length) return 'Opening days not published';
	if (names.length === WEEKDAYS.length) return 'Open every day';
	if (names.length === 1) return `Open ${names[0]}`;
	return `Open ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** `tel:` URL for a phone number as typed ('+27 21 555 0123' → 'tel:+27215550123'). */
export function telHref(phone: string): string {
	const trimmed = phone.trim().split(/\s*(?:ext\.?|x)\s*\d/i)[0];
	const digits = trimmed.replace(/[^\d]/g, '');
	return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

type Hours = { openDays: readonly string[]; openTime: string | null; closeTime: string | null; timezone?: string };

/** Weekday code for `now` in a timezone. */
export function weekdayIn(now: number, timeZone = 'UTC'): (typeof WEEKDAYS)[number] {
	const d = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now).toLowerCase().slice(0, 3);
	return (WEEKDAYS as readonly string[]).includes(d) ? (d as (typeof WEEKDAYS)[number]) : 'mon';
}

/**
 * 'Open today 08:00–17:00' / 'Closed today' (null when no hours are set). Loads on today's board
 * beat the configured opening days (boogies, weather days, special openings): pass `loadsToday`.
 */
export function openToday(h: Hours, now = Date.now(), loadsToday = false): { label: string; tone: 'success' | 'neutral' } | null {
	if (loadsToday) return { label: 'Loads running today', tone: 'success' };
	if (!h.openDays?.length) return null;
	const today = weekdayIn(now, h.timezone);
	if (!h.openDays.includes(today)) return { label: 'Closed today', tone: 'neutral' };
	return { label: h.openTime && h.closeTime ? `Open today ${h.openTime}–${h.closeTime}` : 'Open today', tone: 'success' };
}
