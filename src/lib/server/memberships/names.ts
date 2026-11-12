/** Name matching between the profile name and the association's record (pure). */

function tokens(name: string): string[] {
	return name
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/['’`.-]/g, '')
		.split(/[^a-z]+/)
		.filter(Boolean);
}

export type NameMatch = 'match' | 'mismatch';

/**
 * 'match' when the surnames agree (last word, so "van der Merwe" works) and the first name agrees
 * (same word, an initial, or the association's first name appears among the profile's names).
 * Anything else needs a staff member to confirm the link.
 */
export function compareNames(profileName: string, memberName: string): NameMatch {
	const p = tokens(profileName);
	const m = tokens(memberName);
	if (p.length === 0 || m.length === 0) return 'mismatch';
	const surnameOk = p[p.length - 1] === m[m.length - 1];
	const pf = p[0];
	const mf = m[0];
	const firstOk =
		m.length === 1 || p.length === 1 || pf === mf || ((pf.length === 1 || mf.length === 1) && pf[0] === mf[0]) || p.slice(0, -1).includes(mf);
	return surnameOk && firstOk ? 'match' : 'mismatch';
}

/** Last word of a name, for display ("surname on record"). */
export function surnameOf(name: string): string {
	const parts = name.trim().split(/\s+/);
	return parts[parts.length - 1] ?? '';
}
