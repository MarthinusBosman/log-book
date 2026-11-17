/**
 * Keyboard model for the booking MonthCalendar (WAI-ARIA date picker grid, simplified to
 * bookable days only, since unavailable days are disabled buttons): one tab stop per month,
 * arrows move focus between bookable days (Left/Right = previous/next bookable day, Up/Down =
 * same weekday a week earlier/later, else the nearest bookable day beyond it), Home/End =
 * first/last bookable day of the shown month, PageUp/PageDown = first bookable day of the
 * previous/next month that has one. Moving focus never selects; Enter/Space does (native
 * button). Client-safe, no DOM. Dates are `YYYY-MM-DD`.
 */

export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** The day that should be in the tab order for `month` (YYYY-MM): focused, else selected, else the first bookable one. */
export function calendarTabDate(bookable: readonly string[], month: string, focused: string | null, selected: string | null): string | null {
	const inMonth = (d: string | null): d is string => !!d && d.startsWith(month) && bookable.includes(d);
	if (inMonth(focused)) return focused;
	if (inMonth(selected)) return selected;
	return [...bookable].sort().find((d) => d.startsWith(month)) ?? null;
}

/** Date to move focus to after `key` from `from`, or null when the key isn't handled / nowhere to go. */
export function calendarKeyTarget(bookable: readonly string[], from: string, key: string): string | null {
	const days = [...bookable].sort();
	if (!days.length) return null;
	const after = (d: string) => days.find((x) => x > d) ?? null;
	const before = (d: string) => days.findLast((x) => x < d) ?? null;
	const atOrAfter = (d: string) => days.find((x) => x >= d) ?? null;
	const atOrBefore = (d: string) => days.findLast((x) => x <= d) ?? null;
	const month = from.slice(0, 7);
	switch (key) {
		case 'ArrowRight':
			return after(from);
		case 'ArrowLeft':
			return before(from);
		case 'ArrowDown':
			return atOrAfter(addDays(from, 7));
		case 'ArrowUp':
			return atOrBefore(addDays(from, -7));
		case 'Home': {
			const d = days.find((x) => x.startsWith(month)) ?? null;
			return d === from ? null : d;
		}
		case 'End': {
			const d = days.findLast((x) => x.startsWith(month)) ?? null;
			return d === from ? null : d;
		}
		case 'PageDown': {
			const next = after(`${month}-31`);
			return next ? (days.find((x) => x.startsWith(next.slice(0, 7))) ?? null) : null;
		}
		case 'PageUp': {
			const prev = before(`${month}-01`);
			return prev ? (days.find((x) => x.startsWith(prev.slice(0, 7))) ?? null) : null;
		}
		default:
			return null;
	}
}
