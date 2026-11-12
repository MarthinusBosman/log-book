/** Test helpers: fixture responses and a fake PASA server. Only imported by *.test.ts. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HttpGet } from './types.ts';

export const fixture = (name: string) => readFileSync(join(import.meta.dir, 'pasa', 'fixtures', name), 'utf8');

/** Same markup as the member-details fixture, with another member's fields (synthetic). */
export function detailsFor(m: { number: string; name: string; licence?: string; dropzone?: string }): string {
	return fixture('member-details-no-ratings.html')
		.replace('Pieter O&#39;Neil', m.name)
		.replace('>9002<', `>${m.number}<`)
		.replace('A9200', m.licence ?? 'A1')
		.replace('Example Parachute Club', m.dropzone ?? 'Example Parachute Club');
}

/**
 * Fake para.co.za: `members` maps PASA no. → details HTML; `listed` are the current numbers
 * (the list fixture's 61 rows + these). Records every requested URL.
 */
export function fakePasa(opts: { members?: Record<string, string>; listed?: string[]; down?: boolean } = {}) {
	const members: Record<string, string> = {
		'9001': fixture('member-details.html'),
		'9002': fixture('member-details-no-ratings.html'),
		...opts.members
	};
	const state = { down: !!opts.down, listed: opts.listed ?? [], calls: [] as string[] };
	const get: HttpGet = async (url) => {
		state.calls.push(url);
		if (state.down) throw new (await import('./types.ts')).ProviderUnavailableError('connect ECONNREFUSED');
		const u = new URL(url);
		if (u.pathname === '/Members/MemberListPartialView') {
			const extra = state.listed.map((n) => `<tr onclick="displaySelectedMemberDetails(${n})"><td>X</td></tr>`).join('');
			return { status: 200, text: fixture('member-list.html').replace('</table>', `${extra}</table>`) };
		}
		if (u.pathname === '/Members/GetMemberViewDetails') {
			const n = u.searchParams.get('PASANo') ?? '';
			return { status: 200, text: members[n] ?? fixture('access-denied.html') };
		}
		return { status: 404, text: 'not found' };
	};
	return { get, state, detailCalls: () => state.calls.filter((c) => c.includes('GetMemberViewDetails')).length, listCalls: () => state.calls.filter((c) => c.includes('MemberListPartialView')).length };
}
