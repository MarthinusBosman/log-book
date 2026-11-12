/** Tiny RFC 4180 CSV writer (CRLF, quotes doubled, formula-injection guarded). */
export type CsvColumn<T> = { label: string; value: (row: T) => string | number | boolean | null | undefined };

function cell(v: string | number | boolean | null | undefined): string {
	if (v === null || v === undefined) return '';
	let s = String(v);
	// Spreadsheet formula injection guard for text that starts with = + - @ (numbers are left alone).
	if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
	const lines = [columns.map((c) => cell(c.label)).join(',')];
	for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','));
	return lines.join('\r\n') + '\r\n';
}

/** Minor units → plain decimal string for spreadsheets ("1234.50"). */
export const csvMoney = (minor: number) => (minor / 100).toFixed(2);

export function csvResponse(filename: string, body: string): Response {
	return new Response('\ufeff' + body, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
			'Cache-Control': 'private, no-store'
		}
	});
}
