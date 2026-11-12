/** Client-safe helpers for report time series: fill gaps and bucket long ranges. */

const DAY = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

export type Bucket = 'day' | 'week' | 'month';

/** ≤ 45 days → daily, ≤ 200 → weekly (Monday start), else monthly. */
export function bucketFor(from: string, to: string): Bucket {
	const days = Math.round((parse(to) - parse(from)) / DAY) + 1;
	return days <= 45 ? 'day' : days <= 200 ? 'week' : 'month';
}

export function bucketKey(day: string, bucket: Bucket): string {
	if (bucket === 'day') return day;
	if (bucket === 'month') return `${day.slice(0, 7)}-01`;
	const t = parse(day);
	const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
	return fmt(t - dow * DAY);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function bucketLabel(key: string, bucket: Bucket): string {
	const m = MONTHS[Number(key.slice(5, 7)) - 1];
	if (bucket === 'month') return `${m} ${key.slice(2, 4)}`;
	return `${Number(key.slice(8, 10))} ${m}`;
}

/**
 * Turn sparse per-day rows into a continuous series of buckets between from and to,
 * summing `pick(row)` (one number per series) into each bucket.
 */
export function timeSeries<T extends { day: string }>(
	rows: T[],
	from: string,
	to: string,
	pick: (r: T) => number[],
	seriesCount: number
): { bucket: Bucket; points: { key: string; label: string; title: string; values: number[] }[] } {
	const bucket = bucketFor(from, to);
	const map = new Map<string, number[]>();
	for (let t = parse(from); t <= parse(to); t += DAY) {
		const k = bucketKey(fmt(t), bucket);
		if (!map.has(k)) map.set(k, Array(seriesCount).fill(0));
	}
	for (const r of rows) {
		if (r.day < from || r.day > to) continue;
		const v = map.get(bucketKey(r.day, bucket));
		if (!v) continue;
		pick(r).forEach((n, i) => (v[i] += n));
	}
	const prefix = bucket === 'week' ? 'Week of ' : '';
	return {
		bucket,
		points: [...map.entries()].map(([key, values]) => ({
			key,
			label: bucketLabel(key, bucket),
			title: bucket === 'month' ? bucketLabel(key, bucket) : `${prefix}${key}`,
			values
		}))
	};
}
