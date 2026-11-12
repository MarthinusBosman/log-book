/**
 * Logbook CSV: parsing, column auto-mapping, conversion to bundle jumps, the downloadable
 * template, and CSV writing for exports. Client-safe (the mapping UI runs it in the browser; the
 * server runs it again for no-JS uploads).
 */
import { JUMP_TYPES, JUMP_TYPE_LABELS, type JumpType } from '../domain/constants.ts';
import { emptyBundle, type BJump, type Bundle } from './bundle.ts';
import { altitudeFt } from './jumpmaster/values.ts';
import { inferJumpType } from './jumpmaster/map.ts';

export const CSV_FIELDS = ['jumpNumber', 'jumpDate', 'location', 'aircraft', 'altitudeFt', 'freefallSeconds', 'jumpType', 'description'] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export const CSV_FIELD_LABELS: Record<CsvField, string> = {
	jumpNumber: 'Jump number',
	jumpDate: 'Date',
	location: 'Dropzone / location',
	aircraft: 'Aircraft',
	altitudeFt: 'Exit altitude (ft)',
	freefallSeconds: 'Freefall (seconds)',
	jumpType: 'Jump type',
	description: 'Description / notes'
};

/** column index per field (-1 = not mapped). */
export type CsvMapping = Record<CsvField, number>;
export type DateOrder = 'auto' | 'ymd' | 'dmy' | 'mdy';

export const TEMPLATE_HEADER = ['Jump #', 'Date', 'Dropzone', 'Aircraft', 'Altitude (ft)', 'Freefall (s)', 'Jump type', 'Description'];
export const CSV_TEMPLATE =
	TEMPLATE_HEADER.join(',') +
	'\n' +
	['1', '2024-03-09', 'Skydive Demo DZ', 'Cessna 182', '10000', '45', 'Belly', '"First solo, stable exit"'].join(',') +
	'\n' +
	['2', '2024-03-10', 'Skydive Demo DZ', 'Cessna 182', '10000', '45', 'Belly', '2 way with coach'].join(',') +
	'\n';

/** Detect the delimiter from the first line (comma, semicolon or tab). */
export function detectDelimiter(text: string): string {
	const line = text.split(/\r?\n/, 1)[0] ?? '';
	const counts = [',', ';', '\t'].map((d) => [d, line.split(d).length] as const);
	counts.sort((a, b) => b[1] - a[1]);
	return counts[0][1] > 1 ? counts[0][0] : ',';
}

/** RFC 4180-ish parser: quotes, escaped quotes, CRLF, embedded newlines. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
	const src = text.replace(/^\uFEFF/, '');
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (quoted) {
			if (c === '"') {
				if (src[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += c;
			continue;
		}
		if (c === '"' && cell === '') quoted = true;
		else if (c === delimiter) {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && src[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += c;
	}
	if (cell !== '' || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const SYNONYMS: Record<CsvField, RegExp> = {
	jumpNumber: /^(jump\s*(#|no\.?|num(ber)?)|#|no\.?|number|nr|jump)$/i,
	jumpDate: /^(date|jump\s*date|day|when)$/i,
	location: /^(drop\s*zone|dz|location|place|site|where)$/i,
	aircraft: /^(aircraft|plane|airplane|aeroplane|a\/c)$/i,
	altitudeFt: /^(exit\s*)?(alt(itude)?|height)(\s*\(?(ft|feet|m)\)?)?$/i,
	freefallSeconds: /^(free\s*-?fall|ff|delay|ff\s*time|freefall\s*time)(\s*\(?(s|sec|secs|seconds)\)?)?$/i,
	jumpType: /^(jump\s*)?(type|discipline|kind)$/i,
	description: /^(description|desc|notes?|comments?|remarks?|details)$/i
};

/** Guess the mapping from a header row (falls back to the template's column order). */
export function autoMapping(header: string[]): CsvMapping {
	const m = Object.fromEntries(CSV_FIELDS.map((f) => [f, -1])) as CsvMapping;
	const used = new Set<number>();
	header.forEach((h, i) => {
		const name = h.trim().replace(/[_]+/g, ' ');
		for (const f of CSV_FIELDS) {
			if (m[f] === -1 && !used.has(i) && SYNONYMS[f].test(name)) {
				m[f] = i;
				used.add(i);
			}
		}
	});
	return m;
}

/** True when the first row looks like a header (no date-like cell and mostly letters). */
export function looksLikeHeader(row: string[]): boolean {
	return !row.some((c) => parseDate(c, 'auto') !== null) && row.filter((c) => /[a-z]/i.test(c)).length >= Math.ceil(row.length / 2);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
function valid(y: number, m: number, d: number): string | null {
	if (y < 100) y += y < 70 ? 2000 : 1900;
	if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
	const s = `${y}-${pad(m)}-${pad(d)}`;
	const t = new Date(`${s}T00:00:00Z`);
	return t.getUTCDate() === d ? s : null;
}

/** Parse common logbook date formats → YYYY-MM-DD (null when unparseable). */
export function parseDate(raw: string, order: DateOrder = 'auto'): string | null {
	const s = raw.trim();
	if (!s) return null;
	let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
	if (m) return valid(+m[1], +m[2], +m[3]);
	m = s.match(/^(\d{1,2})[-/. ]([a-z]{3})[a-z]*\.?[-/. ,]+(\d{2,4})$/i);
	if (m && MONTHS.includes(m[2].toLowerCase())) return valid(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
	m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})$/i);
	if (m && MONTHS.includes(m[1].toLowerCase())) return valid(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
	m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
	if (m) {
		const a = +m[1];
		const b = +m[2];
		const y = +m[3];
		if (order === 'mdy' || (order === 'auto' && b > 12 && a <= 12)) return valid(y, a, b);
		return valid(y, b, a);
	}
	return null;
}

/** "45", "45s", "1:05" (m:ss), "1m 5s" → seconds. */
export function parseFreefall(raw: string): number | null {
	const s = raw.trim().toLowerCase();
	if (!s) return null;
	let m = s.match(/^(\d+):(\d{1,2})$/);
	if (m) return +m[1] * 60 + +m[2];
	m = s.match(/^(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?s?)?$/);
	if (m && (m[1] || m[2])) return (+(m[1] ?? 0)) * 60 + +(m[2] ?? 0);
	const n = Number(s.replace(/[^\d.]/g, ''));
	return Number.isFinite(n) && s.replace(/[^\d.]/g, '') ? Math.round(n) : null;
}

export function parseJumpType(raw: string): JumpType | null {
	const s = raw.trim().toLowerCase();
	if (!s) return null;
	if ((JUMP_TYPES as readonly string[]).includes(s)) return s as JumpType;
	for (const [t, label] of Object.entries(JUMP_TYPE_LABELS)) if (label.toLowerCase() === s) return t as JumpType;
	return inferJumpType(s) ?? 'other';
}

/** FNV-1a — stable short hash for CSV row refs. */
function fnv(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}

export type CsvConversion = { jumps: BJump[]; errors: { row: number; message: string }[] };

/** Convert data rows (header excluded) with a mapping into bundle jumps. */
export function rowsToJumps(rows: string[][], mapping: CsvMapping, order: DateOrder = 'auto'): CsvConversion {
	const jumps: BJump[] = [];
	const errors: CsvConversion['errors'] = [];
	const get = (r: string[], f: CsvField) => (mapping[f] >= 0 ? (r[mapping[f]] ?? '').trim() : '');
	const seen = new Set<string>();
	rows.forEach((r, i) => {
		const rowNo = i + 1;
		const date = parseDate(get(r, 'jumpDate'), order);
		if (!date) {
			errors.push({ row: rowNo, message: `Row ${rowNo}: unreadable date "${get(r, 'jumpDate')}"` });
			return;
		}
		const numRaw = get(r, 'jumpNumber').replace(/[^\d]/g, '');
		const jumpNumber = numRaw ? Number(numRaw) : null;
		const description = get(r, 'description') || null;
		const typeRaw = get(r, 'jumpType');
		const ref = jumpNumber ? `csv:${jumpNumber}:${date}` : `csv:${date}:${fnv(r.join('\u0001'))}`;
		if (seen.has(ref)) {
			errors.push({ row: rowNo, message: `Row ${rowNo}: duplicate of an earlier row` });
			return;
		}
		seen.add(ref);
		jumps.push({
			ref,
			jumpNumber: jumpNumber && jumpNumber > 0 ? jumpNumber : null,
			jumpDate: date,
			location: get(r, 'location') || null,
			aircraft: get(r, 'aircraft') || null,
			altitudeFt: altitudeFt(get(r, 'altitudeFt')),
			freefallSeconds: parseFreefall(get(r, 'freefallSeconds')),
			jumpType: typeRaw ? parseJumpType(typeRaw) : inferJumpType(description),
			description
		});
	});
	return { jumps, errors };
}

/** Whole pipeline: CSV text → bundle for the signed-in jumper (person ref `self`). */
export function csvToBundle(
	text: string,
	opts: { mapping?: CsvMapping; hasHeader?: boolean; dateOrder?: DateOrder; name?: string } = {}
): { bundle: Bundle; errors: CsvConversion['errors']; header: string[] | null; mapping: CsvMapping } {
	const rows = parseCsv(text);
	const hasHeader = opts.hasHeader ?? (rows[0] ? looksLikeHeader(rows[0]) : false);
	const header = hasHeader ? rows[0] : null;
	const data = hasHeader ? rows.slice(1) : rows;
	const mapping =
		opts.mapping ??
		(header ? autoMapping(header) : (Object.fromEntries(CSV_FIELDS.map((f, i) => [f, i])) as CsvMapping));
	const { jumps, errors } = rowsToJumps(data, mapping, opts.dateOrder);
	const bundle = emptyBundle('csv');
	bundle.people = [{ ref: 'self', name: opts.name ?? 'Me', ratings: [] }];
	bundle.jumper = { person: 'self', jumps, rigs: [], wallets: [] };
	return { bundle, errors, header, mapping };
}

// ── writing ──────────────────────────────────────────────────────────────────

export function csvCell(v: unknown): string {
	if (v == null) return '';
	let s = String(v);
	// Neutralise spreadsheet formula injection.
	if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
	return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
	return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
