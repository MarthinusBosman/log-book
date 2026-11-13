/** Client-safe money helpers for staff forms (amounts are integer minor units everywhere else). */

/**
 * Parse a user-entered decimal amount ("1 250.50", "1,250.5", "450", "R 450,50") into minor units.
 * Returns null when empty, NaN-ish, or more than 2 decimals. A comma followed by one or two
 * digits is the decimal separator; otherwise commas are thousands separators ("1,000" = 1000,
 * never 1.00). A leading currency symbol or code is ignored. Every server-side money field
 * goes through this so "-5" is never read as 5 and "450,50" never as 45 050.
 */
export function parseMoney(input: string | null | undefined, opts: { allowNegative?: boolean } = {}): number | null {
	if (input == null) return null;
	let s = String(input)
		.trim()
		.replace(/^(?:[A-Za-z]{1,3}|[$€£¥₦₹])[\s\u00a0]*(?=[-\d.,])/, '')
		.replace(/[\s\u00a0\u202f]/g, '');
	if (!s) return null;
	// Treat a lone comma as the decimal separator ("12,50"); otherwise commas are thousands separators.
	if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
	else if (s.includes(',')) {
		// Thousands separators must sit in groups of three ("1,250" / "12,500,000.5"); "1,00,0" is a typo.
		if (!/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) return null;
		s = s.replace(/,/g, '');
	}
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
