/**
 * Staff lists (Jumpers, Staff, Members, Gear) keep their search text and filter chip in the
 * query string (?q=…, ?show=…, ?role=…) so opening a row and pressing back, reloading, or
 * sharing the link returns to the same view. Empty values are left out of the URL.
 */
export const MAX_QUERY = 100;

/** The search text from `?q=` (capped at MAX_QUERY characters). */
export function readQuery(params: Pick<URLSearchParams, 'get'>): string {
	return params.get('q')?.slice(0, MAX_QUERY) ?? '';
}

/** One of `allowed` from `?<key>=`, else ''. */
export function readChoice<T extends string>(params: Pick<URLSearchParams, 'get'>, key: string, allowed: readonly T[]): T | '' {
	const v = params.get(key) as T | null;
	return v && allowed.includes(v) ? v : '';
}

/**
 * New `scrollLeft` for a sideways-scrolling row so the item at [left, left + width) (content
 * coordinates) is fully visible with `pad` px to spare, or null when it already is.
 */
export function rowScrollToReveal(scrollLeft: number, viewWidth: number, left: number, width: number, pad = 16): number | null {
	if (left - pad < scrollLeft) return Math.max(0, left - pad);
	if (left + width + pad > scrollLeft + viewWidth) return Math.max(0, Math.min(left - pad, left + width + pad - viewWidth));
	return null;
}

/** Scroll `row` sideways (no vertical page scroll) so `item` is visible. */
export function revealInRow(row: HTMLElement, item: HTMLElement): void {
	if (row.scrollWidth <= row.clientWidth) return;
	const left = item.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
	const next = rowScrollToReveal(row.scrollLeft, row.clientWidth, left, item.offsetWidth);
	if (next !== null) row.scrollLeft = next;
}

/** `href` with each key set (or removed when empty/null); other query params are kept. */
export function listViewHref(href: string, view: Record<string, string | null | undefined>): string {
	const url = new URL(href);
	for (const [k, v] of Object.entries(view)) {
		if (v) url.searchParams.set(k, v.slice(0, k === 'q' ? MAX_QUERY : undefined));
		else url.searchParams.delete(k);
	}
	return url.href;
}
