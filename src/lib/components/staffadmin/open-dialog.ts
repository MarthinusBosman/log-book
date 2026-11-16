/**
 * "Add …" / "New …" buttons that open a dialog are links to `?new=1` so they work before
 * hydration and without JS: the server renders the dialog open (see `Dialog.svelte`). Once
 * hydrated, the click handler opens the dialog in place instead of navigating.
 */

/** `?…` for the current URL with `new=1` added; other params (day, tab, search) are kept. */
export function newDialogHref(url: { search: string }, drop: readonly string[] = []): string {
	const params = new URLSearchParams(url.search);
	for (const k of drop) params.delete(k);
	params.set('new', '1');
	return `?${params}`;
}

/** Href for the current URL with `set` applied (`null` removes a param); other params are kept. */
export function viewParamsHref(url: { pathname: string; search: string }, set: Record<string, string | null>): string {
	const params = new URLSearchParams(url.search);
	// After a no-JS form post the URL still names the action (`?/create`): don't carry it on.
	for (const k of [...params.keys()]) if (k.startsWith('/')) params.delete(k);
	for (const [k, v] of Object.entries(set)) {
		if (v === null) params.delete(k);
		else params.set(k, v);
	}
	const qs = params.toString();
	return qs ? `?${qs}` : url.pathname;
}

/** True when the URL asks for the "new" dialog (`?new=1`). */
export function wantsNewDialog(params: Pick<URLSearchParams, 'get'>): boolean {
	return params.get('new') === '1';
}

/** Click handler for such a link: opens in place; modified clicks (new tab/window) follow the link. */
export function openInPlace(open: () => void): (e: MouseEvent) => void {
	return (e) => {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		open();
	};
}
