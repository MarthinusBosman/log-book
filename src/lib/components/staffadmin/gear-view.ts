/**
 * The gear page's view (tab, rig filter, "Add rig" dialog) lives in the query string
 * (?tab=members, ?show=attention, ?new=1) so reload, back and shared links return to it.
 * Defaults are left out of the URL.
 */
export type GearTab = 'dz' | 'members';
export type GearOnly = '' | 'attention' | 'available' | 'in_use' | 'grounded';
export type GearView = { tab: GearTab; only: GearOnly; adding: boolean };

const ONLY: GearOnly[] = ['attention', 'available', 'in_use', 'grounded'];

export function readGearView(params: Pick<URLSearchParams, 'get'>): GearView {
	const show = params.get('show') as GearOnly | null;
	return {
		tab: params.get('tab') === 'members' ? 'members' : 'dz',
		only: show && ONLY.includes(show) ? show : '',
		adding: params.get('new') === '1'
	};
}

/** `href` with the view applied; other query params are kept. */
export function gearViewHref(href: string, view: GearView): string {
	const url = new URL(href);
	const set = (k: string, v: string | null) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
	set('tab', view.tab === 'members' ? 'members' : null);
	set('show', view.only || null);
	set('new', view.adding ? '1' : null);
	return url.href;
}
