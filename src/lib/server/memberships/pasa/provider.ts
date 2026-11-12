/**
 * PASA provider: reads the same two public fragments the www.para.co.za/Members page loads
 * (see `parse.ts`). One request per member lookup; the full members list (≈200 KB) is only used
 * to tell current from lapsed members and is cached for a day by the service.
 */
import type { MembershipProvider } from '../types.ts';
import { ProviderUnavailableError } from '../types.ts';
import { parseMemberDetails, parseMemberList } from './parse.ts';

export const PASA_BASE_URL = 'https://www.para.co.za';
/** The public directory page (linked from the UI as the source). */
export const PASA_DIRECTORY_URL = `${PASA_BASE_URL}/Members`;

/** The list has had ~450 members; far fewer means a broken/partial response, so don't trust it. */
const MIN_LIST_SIZE = 50;

/** PASA memberships run April → 31 March. Current on `today` → this season's 31 March; else the last one. */
export function pasaExpiry(current: boolean, today: string): string {
	const y = Number(today.slice(0, 4));
	const afterMarch = Number(today.slice(5, 7)) >= 4;
	const seasonEnd = afterMarch ? y + 1 : y;
	return `${current ? seasonEnd : seasonEnd - 1}-03-31`;
}

export const pasaProvider: MembershipProvider = {
	id: 'pasa',
	label: 'PASA',
	normaliseNumber(input) {
		const s = input.trim().replace(/^pasa\s*(no\.?|number|#)?\s*/i, '');
		if (!/^\d{1,7}$/.test(s)) return null;
		const n = String(Number(s));
		return n === '0' ? null : n;
	},
	async fetchMember(number, get) {
		const res = await get(`${PASA_BASE_URL}/Members/GetMemberViewDetails?PASANo=${encodeURIComponent(number)}`);
		if (res.status !== 200) throw new ProviderUnavailableError(`PASA answered HTTP ${res.status}`);
		const member = parseMemberDetails(res.text);
		if (member && member.number !== number) throw new ProviderUnavailableError('PASA returned a different member');
		if (!member && !/Access Denied/i.test(res.text)) throw new ProviderUnavailableError('Unexpected PASA response');
		return member;
	},
	async fetchCurrentNumbers(get) {
		const res = await get(`${PASA_BASE_URL}/Members/MemberListPartialView?ratingUniqueId=0&licenceId=0&dropZoneId=0`);
		if (res.status !== 200) throw new ProviderUnavailableError(`PASA answered HTTP ${res.status}`);
		try {
			return parseMemberList(res.text, MIN_LIST_SIZE);
		} catch (e) {
			throw new ProviderUnavailableError(e instanceof Error ? e.message : 'Unexpected PASA members list');
		}
	},
	expiryFor: pasaExpiry
};
