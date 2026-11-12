// Client-safe currency helpers shared by the new-dropzone form and Settings.

/** Currencies offered in the pickers (any valid ISO 4217 code is still accepted server-side). */
export const CURRENCIES = [
	'ZAR',
	'USD',
	'EUR',
	'GBP',
	'AUD',
	'NZD',
	'CAD',
	'NAD',
	'BWP',
	'KES',
	'CHF',
	'NOK',
	'SEK',
	'DKK',
	'BRL'
] as const;

const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK';

const BY_COUNTRY: Record<string, string> = {
	ZA: 'ZAR',
	LS: 'ZAR',
	NA: 'NAD',
	BW: 'BWP',
	KE: 'KES',
	US: 'USD',
	PR: 'USD',
	GB: 'GBP',
	AU: 'AUD',
	NZ: 'NZD',
	CA: 'CAD',
	CH: 'CHF',
	LI: 'CHF',
	NO: 'NOK',
	SE: 'SEK',
	DK: 'DKK',
	BR: 'BRL',
	...Object.fromEntries(EURO.split(' ').map((c) => [c, 'EUR']))
};

/** The usual currency for a 2-letter country code, or null when we don't know it. */
export function currencyForCountry(country: string | null | undefined): string | null {
	return BY_COUNTRY[(country ?? '').trim().toUpperCase()] ?? null;
}
