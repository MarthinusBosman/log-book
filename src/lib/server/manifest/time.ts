/** Wall-clock helpers for the manifest (DZ timezone ↔ instants). Pure, no DB. */

/** Offset (ms) of `timeZone` from UTC at instant `at` (positive east of Greenwich). */
export function tzOffsetMs(at: number, timeZone: string): number {
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		}).formatToParts(new Date(at));
		const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
		const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
		return asUtc - Math.floor(at / 1000) * 1000;
	} catch {
		return 0;
	}
}

/** Instant (ms) for a DZ-local `YYYY-MM-DD` + `HH:MM`. Returns null for malformed input. */
export function zonedTime(day: string, hhmm: string, timeZone: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
	const [h, m] = hhmm.split(':').map(Number);
	if (h > 23 || m > 59) return null;
	const naive = Date.parse(`${day}T${hhmm}:00Z`);
	if (Number.isNaN(naive)) return null;
	// two passes handle DST edges
	let t = naive - tzOffsetMs(naive, timeZone);
	t = naive - tzOffsetMs(t, timeZone);
	return t;
}

/** `HH:MM` in the DZ timezone. */
export function wallClock(at: number, timeZone: string): string {
	try {
		return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
	} catch {
		return new Date(at).toISOString().slice(11, 16);
	}
}
