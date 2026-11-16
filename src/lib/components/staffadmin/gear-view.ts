import { listViewHref } from './list-view.ts';

/**
 * The gear page's view (tab, rig filter, "Add rig" dialog) lives in the query string
 * (?tab=members, ?show=attention, ?new=1) so reload, back and shared links return to it.
 * Defaults are left out of the URL.
 */
export type GearTab = 'dz' | 'members';
export type GearOnly = '' | 'attention' | 'available' | 'in_use' | 'grounded';
/** `allMembers`: the "Jumpers' gear" tab lists every member rig, not only those due (?all=1). */
export type GearView = { tab: GearTab; only: GearOnly; adding: boolean; allMembers: boolean };

const ONLY: GearOnly[] = ['attention', 'available', 'in_use', 'grounded'];

export function readGearView(params: Pick<URLSearchParams, 'get'>): GearView {
	const show = params.get('show') as GearOnly | null;
	return {
		tab: params.get('tab') === 'members' ? 'members' : 'dz',
		only: show && ONLY.includes(show) ? show : '',
		adding: params.get('new') === '1',
		allMembers: params.get('all') === '1'
	};
}

/** Query params for the view (defaults → null, i.e. left out of the URL). */
export function gearViewParams(view: GearView): Record<string, string | null> {
	return {
		tab: view.tab === 'members' ? 'members' : null,
		show: view.only || null,
		new: view.adding ? '1' : null,
		all: view.tab === 'members' && view.allMembers ? '1' : null
	};
}

/** `href` with the view applied; other query params are kept. */
export function gearViewHref(href: string, view: GearView): string {
	return listViewHref(href, gearViewParams(view));
}
