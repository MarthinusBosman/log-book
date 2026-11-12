/** Date helpers. Calendar dates are `YYYY-MM-DD` strings in the dropzone's timezone. */

export const MINUTE = 60_000;
export const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` for an instant in an IANA timezone. */
export function localDate(at: number | Date, timeZone = 'UTC'): string {
	const d = typeof at === 'number' ? new Date(at) : at;
	try {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(d);
	} catch {
		return d.toISOString().slice(0, 10);
	}
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(s: unknown): s is string {
	return typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Add whole days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
	const t = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
	return new Date(t).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
	return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
	return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Earliest date of birth forms accept (catches mangled years such as 0505). */
export const MIN_DOB = '1900-01-01';

/** Why a typed date of birth is implausible, or null when it's fine (one day of time-zone slack). */
export function dobProblem(dob: string, now = Date.now()): string | null {
	if (!isIsoDate(dob)) return 'Date of birth must be a valid date';
	if (dob < MIN_DOB) return 'Date of birth is too far in the past: check the year';
	if (dob > localDate(now + DAY_MS)) return 'Date of birth is in the future: check the year';
	return null;
}

/** Age in whole years on a given date. */
export function ageOn(dob: string, on: string): number {
	const [y1, m1, d1] = dob.split('-').map(Number);
	const [y2, m2, d2] = on.split('-').map(Number);
	return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}
