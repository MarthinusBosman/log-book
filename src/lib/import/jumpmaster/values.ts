/**
 * Value normalisers for Jump Master (Firebase/Firestore) data. Client-safe and pure.
 *
 * Accepts every JSON shape a Firestore document can take after export:
 *  - timestamps: ISO strings, epoch ms/seconds, `{seconds|_seconds, nanoseconds}`, `{timestampValue}`
 *  - references: full resource names (`projects/p/databases/(default)/documents/users/x`),
 *    plain paths (`users/x`, `/users/x`), `{path}`, `{referenceValue}`, `{__ref__}`
 *  - numbers as numbers or numeric strings (`integerValue` arrives as a string over REST)
 */

export function toInstant(v: unknown): number | null {
	if (v == null || v === '') return null;
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
	if (typeof v === 'number') {
		if (!Number.isFinite(v)) return null;
		return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
	}
	if (typeof v === 'string') {
		if (/^\d+(\.\d+)?$/.test(v)) return toInstant(Number(v));
		const t = Date.parse(v);
		return Number.isNaN(t) ? null : t;
	}
	if (typeof v === 'object') {
		const o = v as Record<string, unknown>;
		if ('timestampValue' in o) return toInstant(o.timestampValue);
		const s = o.seconds ?? o._seconds;
		if (s != null) {
			const ns = Number(o.nanoseconds ?? o._nanoseconds ?? 0);
			return Number(s) * 1000 + Math.floor(ns / 1e6);
		}
		if ('__time__' in o) return toInstant(o.__time__);
	}
	return null;
}

/** `YYYY-MM-DD` of an instant in an IANA timezone (falls back to UTC). */
export function dateIn(ms: number, timeZone = 'UTC'): string {
	try {
		return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
	} catch {
		return new Date(ms).toISOString().slice(0, 10);
	}
}

/** `HH:MM` of an instant in a timezone. */
export function timeIn(ms: number, timeZone = 'UTC'): string {
	try {
		const s = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
		return s.slice(0, 5);
	} catch {
		return new Date(ms).toISOString().slice(11, 16);
	}
}

export function toDate(v: unknown, timeZone = 'UTC'): string | null {
	if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
	const t = toInstant(v);
	return t == null ? null : dateIn(t, timeZone);
}

export function toIso(v: unknown): string | null {
	const t = toInstant(v);
	return t == null ? null : new Date(t).toISOString();
}

/** Normalise any reference shape to a document path like `users/abc`. */
export function refPath(v: unknown): string | null {
	if (v == null || v === '') return null;
	if (typeof v === 'object') {
		const o = v as Record<string, unknown>;
		return refPath(o.referenceValue ?? o.path ?? o.__ref__ ?? o._path ?? null);
	}
	if (typeof v !== 'string') return null;
	let s = v.trim();
	const marker = '/documents/';
	const i = s.indexOf(marker);
	if (i >= 0) s = s.slice(i + marker.length);
	s = s.replace(/^\/+|\/+$/g, '');
	return s.includes('/') ? s : null;
}

export function refId(path: string | null | undefined): string | null {
	if (!path) return null;
	const parts = path.split('/');
	return parts[parts.length - 1] || null;
}

export function toNum(v: unknown): number | null {
	if (v == null || v === '') return null;
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	if (typeof v === 'string') {
		const n = Number(v.replace(/[,\s]/g, '').replace(/[^\d.-]/g, ''));
		return v.trim() && Number.isFinite(n) ? n : null;
	}
	return null;
}

export function toStr(v: unknown, max = 2000): string | null {
	if (v == null) return null;
	const s = (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '').trim();
	return s ? s.slice(0, max) : null;
}

export function toBool(v: unknown): boolean {
	return v === true || v === 'true' || v === 1;
}

/** Major units (e.g. Rand) → integer minor units. */
export function majorToMinor(v: unknown): number {
	const n = toNum(v);
	return n == null ? 0 : Math.round(n * 100);
}

/** Integer cents (already minor units). */
export function cents(v: unknown): number {
	const n = toNum(v);
	return n == null ? 0 : Math.round(n);
}

/** Altitude text like "13500", "13,500 ft", "4000m" → feet. */
export function altitudeFt(v: unknown): number | null {
	if (v == null || v === '') return null;
	if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
	const s = String(v).toLowerCase();
	const n = toNum(s.replace(/k\b/, '000'));
	if (n == null || n <= 0) return null;
	return /\d\s*m(etres|eters|\b)/.test(s) && !/ft|feet/.test(s) ? Math.round(n * 3.28084) : Math.round(n);
}

/** Flutter colours ("0xFF2196F3", "#ff2196f3", "Color(0xff2196f3)") → "#2196F3". */
export function colour(v: unknown): string | null {
	const s = toStr(v);
	if (!s) return null;
	const m = s.match(/(?:0x|#)?([0-9a-f]{8}|[0-9a-f]{6})\b/i);
	if (!m) return null;
	const hex = m[1].length === 8 ? m[1].slice(2) : m[1];
	return `#${hex.toUpperCase()}`;
}

/** "08:00", "8:00 AM", "17:30" → "HH:MM". */
export function hhmm(v: unknown): string | null {
	const s = toStr(v);
	if (!s) return null;
	const m = s.match(/^(\d{1,2})[:h.](\d{2})\s*([ap]\.?m\.?)?/i);
	if (!m) return null;
	let h = Number(m[1]);
	const min = Number(m[2]);
	const ap = m[3]?.toLowerCase();
	if (ap?.startsWith('p') && h < 12) h += 12;
	if (ap?.startsWith('a') && h === 12) h = 0;
	if (h > 23 || min > 59) return null;
	return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export function weekday(v: unknown): (typeof WEEKDAY_NAMES)[number] | null {
	const s = toStr(v)?.toLowerCase().slice(0, 3);
	return s && (WEEKDAY_NAMES as readonly string[]).includes(s) ? (s as (typeof WEEKDAY_NAMES)[number]) : null;
}
export function weekdayIndex(v: unknown): number | null {
	const d = weekday(v);
	return d ? WEEKDAY_NAMES.indexOf(d) : null;
}

const SYMBOLS: Record<string, string> = { R: 'ZAR', ZAR: 'ZAR', $: 'USD', US$: 'USD', '€': 'EUR', '£': 'GBP', A$: 'AUD', NZ$: 'NZD', 'N$': 'NAD' };
/** Currency from an ISO code ("zar") or a display symbol ("R"). */
export function currencyCode(v: unknown): string | null {
	const s = toStr(v);
	if (!s) return null;
	if (/^[a-z]{3}$/i.test(s)) return s.toUpperCase();
	return SYMBOLS[s] ?? null;
}

// ── Firestore REST value decoding ────────────────────────────────────────────

export type FsValue = Record<string, unknown>;
export type FsDocument = { name: string; fields?: Record<string, FsValue>; createTime?: string; updateTime?: string };

/** Decode one Firestore REST `Value` into plain JSON (refs → paths, timestamps → ISO). */
export function decodeValue(v: FsValue | undefined): unknown {
	if (!v || typeof v !== 'object') return null;
	if ('nullValue' in v) return null;
	if ('stringValue' in v) return v.stringValue;
	if ('booleanValue' in v) return !!v.booleanValue;
	if ('integerValue' in v) return Number(v.integerValue);
	if ('doubleValue' in v) return Number(v.doubleValue);
	if ('timestampValue' in v) return toIso(v.timestampValue);
	if ('referenceValue' in v) return refPath(v.referenceValue);
	if ('geoPointValue' in v) return v.geoPointValue;
	if ('bytesValue' in v) return null;
	if ('arrayValue' in v) {
		const values = ((v.arrayValue as { values?: FsValue[] }) ?? {}).values ?? [];
		return values.map(decodeValue);
	}
	if ('mapValue' in v) return decodeFields(((v.mapValue as { fields?: Record<string, FsValue> }) ?? {}).fields);
	return null;
}

export function decodeFields(fields: Record<string, FsValue> | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeValue(v);
	return out;
}

/** A REST document → `{ id, path, ...fields }`. */
export function decodeDocument(doc: FsDocument): JmDoc {
	const path = refPath(doc.name) ?? doc.name;
	return { ...decodeFields(doc.fields), id: refId(path) ?? path, path };
}

export type JmDoc = { id: string; path?: string; [field: string]: unknown };
