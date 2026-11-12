/** Client-safe money helpers for staff forms (amounts are integer minor units everywhere else). */

/**
 * Parse a user-entered decimal amount ("1 250.50", "1,250.5", "450") into minor units.
 * Returns null when empty, NaN-ish, or more than 2 decimals.
 */
export function parseMoney(input: string | null | undefined, opts: { allowNegative?: boolean } = {}): number | null {
	if (input == null) return null;
	let s = String(input).trim().replace(/[\s\u00a0]/g, '');
	if (!s) return null;
	// Treat a lone comma as the decimal separator ("12,50"); otherwise commas are thousands separators.
	if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
	else s = s.replace(/,/g, '');
	if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
	const neg = s.startsWith('-');
	if (neg && !opts.allowNegative) return null;
	const [whole, frac = ''] = s.replace('-', '').split('.');
	const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
	if (!Number.isSafeInteger(minor)) return null;
	return neg ? -minor : minor;
}

/** Minor units → input value ("450.00"). */
export function minorToInput(minor: number): string {
	return (minor / 100).toFixed(2);
}

/** Currency symbol for display next to inputs (e.g. ZAR → "R", USD → "$"). */
export function currencySymbol(currency: string, locale = 'en-ZA'): string {
	try {
		const part = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
			.formatToParts(0)
			.find((p) => p.type === 'currency');
		return part?.value ?? currency;
	} catch {
		return currency;
	}
}

/** Whole-unit money for stat tiles ("R 78 820"); falls back to code + amount. */
export function formatMoneyShort(minor: number, currency: string, locale = 'en-ZA'): string {
	try {
		return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(minor / 100));
	} catch {
		return `${currency} ${Math.round(minor / 100)}`;
	}
}
