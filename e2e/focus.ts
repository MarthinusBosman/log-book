import type { Page } from '@playwright/test';

/**
 * Tabs through the page (up to `max` stops, stopping when focus wraps) and returns the focus stops
 * that show no focus indicator: no outline and no visible box-shadow ring on the element, its
 * `::after` (stretched links) or one of its three nearest ancestors (`focus-within` wrappers).
 * A border-colour change alone does not count. [] when every stop is visibly focused.
 */
export async function invisibleFocusStops(page: Page, max = 80): Promise<string[]> {
	const bad: string[] = [];
	let first: string | null = null;
	// fields animate their ring in (transition-[border-color,box-shadow]): read the end state
	await page.addStyleTag({ content: '*, *::after { transition: none !important; }' });
	for (let i = 0; i < max; i++) {
		await page.keyboard.press('Tab');
		const r = await page.evaluate(() => {
			const e = document.activeElement as HTMLElement | null;
			if (!e || e === document.body) return null;
			// Chrome's date picker button lives in the input's UA shadow root (the host doesn't match
			// :focus there) and draws its own ring
			if (!e.matches(':focus')) return { ok: true, id: `${e.tagName.toLowerCase()} (native part)` };
			const shown = (el: Element, pseudo?: string) => {
				const cs = getComputedStyle(el, pseudo);
				if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) return true;
				if (!cs.boxShadow || cs.boxShadow === 'none') return false;
				return cs.boxShadow.split(/,(?![^(]*\))/).some((s) => {
					const transparent = /rgba\([^)]*,\s*0\)|transparent|\/\s*0\)/.test(s);
					const lengths = s.replace(/\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? [];
					return !transparent && lengths.slice(2).some((l) => parseFloat(l) > 0);
				});
			};
			let ok = shown(e) || shown(e, '::after');
			let p = e.parentElement;
			for (let n = 0; n < 3 && p && !ok; n++, p = p.parentElement) ok = shown(p);
			const label = e.getAttribute('aria-label') || (e as HTMLInputElement).name || e.innerText || '';
			return { ok, id: `${e.tagName.toLowerCase()} ${label.trim().slice(0, 40)}` };
		});
		if (!r) continue;
		if (r.id === first) break;
		first ??= r.id;
		if (!r.ok && !bad.includes(r.id)) bad.push(r.id);
	}
	return bad;
}
