/**
 * Parsers for PASA's public members directory (https://www.para.co.za/Members).
 *
 * The page itself loads two HTML fragments with jQuery:
 *  - `GET /Members/MemberListPartialView?ratingUniqueId=0&licenceId=0&dropZoneId=0`: an accordion
 *    per dropzone with rows `<tr onclick="displaySelectedMemberDetails(<PASA no>)">` (surname,
 *    first name, PASA no., highest licence). The page notes memberships expire on 31 March, and the
 *    list only holds paid-up members, so "on the list" = current.
 *  - `GET /Members/GetMemberViewDetails?PASANo=<n>`: the modal for one member: Name, PASA No.,
 *    Drop Zone, Licence, then a "Ratings" section of label/value rows. Unknown numbers return a
 *    full "PASA - Access Denied" HTML page (still HTTP 200).
 * Plain regexes: no DOM on Cloudflare Workers, and the markup is simple and server-rendered.
 */
import type { MembershipCheckRating } from '../../db/schema.ts';
import type { ProviderMember } from '../types.ts';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeHtml(s: string): string {
	return s
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
			if (e[0] === '#') {
				const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
				return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
			}
			return ENTITIES[e.toLowerCase()] ?? m;
		})
		.replace(/\s+/g, ' ')
		.trim();
}

const PAIR = /<span class="modal-content-label">([\s\S]*?)<\/span>\s*<span class="modal-content-value">([\s\S]*?)<\/span>/g;

/** PASA rating labels → the names we use (`KNOWN_RATINGS.pasa`); unknown labels pass through. */
const RATING_NAMES: Record<string, string> = {
	jumpmaster: 'Jumpmaster',
	instructor: 'Instructor',
	'aff instructor': 'AFF Instructor',
	coach: 'Coach',
	tandem: 'Tandem',
	'tandem master': 'Tandem',
	pro: 'PRO Rating',
	'pro rating': 'PRO Rating',
	'parachute technician': 'Parachute Technician',
	'senior parachute technician': 'Senior Parachute Technician',
	'master parachute technician': 'Master Parachute Technician'
};

const label = (raw: string) => decodeHtml(raw.replace(/<[^>]*>/g, '')).replace(/\s*:\s*$/, '');
const value = (raw: string) => {
	const v = decodeHtml(raw.replace(/<[^>]*>/g, ''));
	return v === '' ? null : v;
};

export function ratingName(pasaLabel: string): string {
	const k = pasaLabel.trim().replace(/\s+/g, ' ').toLowerCase();
	return (RATING_NAMES[k] ?? RATING_NAMES[k.replace(/ rating$/, '')] ?? pasaLabel.trim()).slice(0, 60);
}

/** Parse the member-details fragment. Returns null for the "Access Denied" page (no such member). */
export function parseMemberDetails(html: string): ProviderMember | null {
	if (!/Member Details/i.test(html) || /<title>[^<]*Access Denied/i.test(html)) return null;
	const ratingsAt = html.search(/>\s*Ratings\s*</i);
	const head = ratingsAt >= 0 ? html.slice(0, ratingsAt) : html;
	const tail = ratingsAt >= 0 ? html.slice(ratingsAt) : '';
	const fields = new Map<string, string | null>();
	for (const m of head.matchAll(PAIR)) fields.set(label(m[1]).toLowerCase(), value(m[2]));
	const name = fields.get('name');
	const number = fields.get('pasa no.') ?? fields.get('pasa no');
	if (!name || !number || !/^\d+$/.test(number)) return null;
	const ratings: MembershipCheckRating[] = [];
	for (const m of tail.matchAll(PAIR)) {
		const l = label(m[1]);
		if (!l) continue;
		const rating = ratingName(l);
		if (!ratings.some((r) => r.rating === rating)) ratings.push({ rating, value: value(m[2]) });
	}
	return {
		number,
		name,
		licence: fields.get('licence') ?? null,
		dropzone: fields.get('drop zone') ?? null,
		ratings
	};
}

/** PASA numbers on the members-list fragment (deduplicated, as strings). Throws if it doesn't look like the list. */
export function parseMemberList(html: string, minExpected = 1): string[] {
	if (!/id="accordion"/.test(html)) throw new Error('Unexpected PASA members list markup');
	const nums = new Set<string>();
	for (const m of html.matchAll(/displaySelectedMemberDetails\((\d+)\)/g)) nums.add(String(Number(m[1])));
	if (nums.size < minExpected) throw new Error(`PASA members list looks incomplete (${nums.size} rows)`);
	return [...nums];
}
