import type { Page } from '@playwright/test';

/**
 * How far the element `#id` sits below the bottom of the sticky/fixed top bar (negative = its top is
 * hidden under the bar). Used after `#hash` jumps: the browser scrolls the target to the very top, so
 * every anchor target needs a scroll-margin at least the height of the page's sticky header.
 */
export function gapBelowTopBar(page: Page, id: string) {
	return page.evaluate((id) => {
		const el = document.getElementById(id);
		if (!el) return Number.NaN;
		const bars = [...document.querySelectorAll('header')].filter((h) => {
			const s = getComputedStyle(h);
			const r = h.getBoundingClientRect();
			return (s.position === 'sticky' || s.position === 'fixed') && r.top <= 0 && r.bottom > 0 && r.height > 0;
		});
		const barBottom = Math.max(0, ...bars.map((h) => h.getBoundingClientRect().bottom));
		return Math.round(el.getBoundingClientRect().top - barBottom);
	}, id);
}
