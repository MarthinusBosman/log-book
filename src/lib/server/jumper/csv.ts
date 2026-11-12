import { JUMP_TYPE_LABELS, type JumpType } from '../../domain/constants.ts';
import type { LogbookJump } from '../db/schema.ts';

/** RFC 4180 field; also neutralises spreadsheet formula injection (=,+,-,@ prefixes). */
export function csvField(v: unknown): string {
	if (v === null || v === undefined) return '';
	let s = v instanceof Date ? v.toISOString() : String(v);
	if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(fields: unknown[]): string {
	return fields.map(csvField).join(',');
}

export const jumpTypeLabel = (t: string | null | undefined) => (t ? (JUMP_TYPE_LABELS[t as JumpType] ?? t) : '');

export const LOGBOOK_CSV_HEADER = [
	'Jump #',
	'Date',
	'Dropzone / location',
	'Aircraft',
	'Altitude (ft)',
	'Freefall (s)',
	'Jump type',
	'Description',
	'Verified by dropzone',
	'Signed by',
	'Signer licence',
	'Signed at',
	'Source'
];

/** Logbook → CSV text (CRLF line endings, UTF-8 BOM so Excel picks the encoding). */
export function logbookCsv(jumps: (LogbookJump & { dropzoneName?: string | null })[]): string {
	const lines = [csvRow(LOGBOOK_CSV_HEADER)];
	for (const j of jumps) {
		lines.push(
			csvRow([
				j.jumpNumber,
				j.jumpDate,
				j.dropzoneName ?? j.location,
				j.aircraft,
				j.altitudeFt,
				j.freefallSeconds,
				jumpTypeLabel(j.jumpType),
				j.description,
				j.verified ? 'yes' : 'no',
				j.signerName,
				j.signerLicence,
				j.signedAt ? j.signedAt.toISOString().slice(0, 10) : '',
				j.source
			])
		);
	}
	return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
