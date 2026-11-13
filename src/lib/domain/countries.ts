// Client-safe country helpers for the dropzone country picker (new dropzone + Settings).
// The country drives the default reserve repack interval and the currency suggestion, so a
// free-typed code was risky: "SA" (Saudi Arabia) for South Africa, "UK" (not a code) for Britain.

/** ISO 3166-1 alpha-2 codes (officially assigned, plus XK for Kosovo). */
export const COUNTRY_CODES = (
	'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
	'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
	'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
	'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
	'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
	'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
	'UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ');

const KNOWN = new Set(COUNTRY_CODES);

/** Common non-ISO spellings owners type, mapped to the real code. */
const ALIASES: Record<string, string> = { UK: 'GB', EL: 'GR' };

/** The canonical 2-letter code for user input, or null when it isn't a country. */
export function normalizeCountry(input: string | null | undefined): string | null {
	const c = (input ?? '').trim().toUpperCase();
	const code = ALIASES[c] ?? c;
	return KNOWN.has(code) ? code : null;
}

/** Display name of a country code ("ZA" → "South Africa"), falling back to the code. */
export function countryName(code: string, locale = 'en'): string {
	try {
		return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
	} catch {
		return code;
	}
}

/** Picker options sorted by name. `current` is kept even if it isn't a known code (old data). */
export function countryOptions(current?: string | null, locale = 'en'): { value: string; label: string }[] {
	let names: Intl.DisplayNames | null = null;
	try {
		names = new Intl.DisplayNames([locale], { type: 'region' });
	} catch {
		names = null;
	}
	const codes = current && !KNOWN.has(current) ? [current, ...COUNTRY_CODES] : COUNTRY_CODES;
	return codes
		.map((value) => ({ value, label: names?.of(value) ?? value }))
		.sort((a, b) => a.label.localeCompare(b.label, locale));
}

/** Region of a browser language tag ("en-ZA" → "ZA"), used to preselect the country. */
export function countryFromLanguage(lang: string | null | undefined): string | null {
	const m = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2})\b/.exec(lang ?? '');
	return m ? normalizeCountry(m[1]) : null;
}
