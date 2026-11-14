import { goto } from '$app/navigation';
import { listViewHref } from './list-view.ts';

/**
 * Mirror a list's view state (search text, filter chip, tab…) into the query string while the
 * component is mounted. Call during component init; `view` reads the `$state` it tracks.
 *
 * Uses a real `goto(…, { replaceState })`, not shallow routing: Kit 3's popstate navigates to
 * the entry's underlying page URL, so a shallow `replaceState` URL is lost on back. Loads that
 * don't read these params don't re-run, so this costs no request. Debounced while typing.
 */
export function syncViewToUrl(view: () => Record<string, string | null | undefined>, delayMs = 250): void {
	$effect(() => {
		const v = view();
		const timer = setTimeout(() => {
			const href = listViewHref(location.href, v);
			if (href !== location.href) void goto(href, { replace: true, reset: false });
		}, delayMs);
		return () => clearTimeout(timer);
	});
}
