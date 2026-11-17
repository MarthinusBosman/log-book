import { describe, expect, test } from 'bun:test';
import { CURRENT_ITEM, MAX_QUERY, listViewHref, readChoice, readQuery, revealCurrent, rowScrollToReveal } from './list-view.ts';

const base = 'https://log-book.app/app/jumpers';
const params = (qs: string) => new URL(`${base}${qs}`).searchParams;

describe('staff list view in the URL', () => {
	test('reads the search text, capped', () => {
		expect(readQuery(params('?q=Anna%20B'))).toBe('Anna B');
		expect(readQuery(params(''))).toBe('');
		expect(readQuery(params(`?q=${'x'.repeat(300)}`))).toHaveLength(MAX_QUERY);
	});

	test('reads only allowed choices', () => {
		const allowed = ['checked_in', 'staff'] as const;
		expect(readChoice(params('?show=staff'), 'show', allowed)).toBe('staff');
		expect(readChoice(params('?show=bogus'), 'show', allowed)).toBe('');
		expect(readChoice(params(''), 'show', allowed)).toBe('');
	});

	test('writes values, drops empty ones, keeps other params', () => {
		expect(listViewHref(`${base}?from=2026-11-01`, { q: 'anna', show: 'staff' })).toBe(`${base}?from=2026-11-01&q=anna&show=staff`);
		expect(listViewHref(`${base}?q=anna&show=staff&from=2026-11-01`, { q: '', show: null })).toBe(`${base}?from=2026-11-01`);
		expect(listViewHref(base, { q: 'a&b=c' })).toBe(`${base}?q=a%26b%3Dc`);
		expect(new URL(listViewHref(base, { q: 'y'.repeat(300) })).searchParams.get('q')).toHaveLength(MAX_QUERY);
	});

	test('round-trips', () => {
		const href = listViewHref(base, { q: 'Ström 42', show: 'checked_in' });
		expect(readQuery(new URL(href).searchParams)).toBe('Ström 42');
		expect(readChoice(new URL(href).searchParams, 'show', ['checked_in'])).toBe('checked_in');
	});
});

describe('rowScrollToReveal (active filter chip on a phone)', () => {
	test('leaves a visible chip alone', () => {
		expect(rowScrollToReveal(0, 390, 100, 80)).toBeNull();
	});
	test('scrolls right just enough to show a chip past the edge', () => {
		// chip at 500..600 in a 390-wide row → right edge + 16 px pad at the view's right
		expect(rowScrollToReveal(0, 390, 500, 100)).toBe(600 + 16 - 390);
	});
	test('scrolls back left for a chip before the view', () => {
		expect(rowScrollToReveal(300, 390, 100, 80)).toBe(84);
		expect(rowScrollToReveal(300, 390, 8, 80)).toBe(0);
	});
	test('a chip wider than the view aligns its start', () => {
		expect(rowScrollToReveal(0, 100, 400, 200)).toBe(384);
	});
});

describe('revealCurrent (tab strip deep link on a phone)', () => {
	// A 390-wide strip whose current tab sits at 500..600 in content coordinates.
	function strip(selector: string | null) {
		const tab = { offsetWidth: 100, getBoundingClientRect: () => ({ left: 500 - row.scrollLeft }) };
		const row = {
			scrollLeft: 0,
			scrollWidth: 700,
			clientWidth: 390,
			getBoundingClientRect: () => ({ left: 0 }),
			querySelector: (sel: string) => (selector && sel.includes(selector) ? tab : null)
		};
		return row;
	}
	test('scrolls the aria-current tab into view on mount', () => {
		const row = strip('aria-current');
		revealCurrent(row as unknown as HTMLElement, 'jumpers');
		expect(row.scrollLeft).toBe(600 + 16 - 390);
	});
	test('also handles role=tab strips (aria-selected), after the update tick', async () => {
		const row = strip('aria-selected');
		const action = revealCurrent(row as unknown as HTMLElement, 'a');
		row.scrollLeft = 0;
		action.update('b');
		expect(row.scrollLeft).toBe(0);
		await Promise.resolve();
		expect(row.scrollLeft).toBe(226);
	});
	test('no current tab: nothing moves', () => {
		const row = strip(null);
		revealCurrent(row as unknown as HTMLElement);
		expect(row.scrollLeft).toBe(0);
	});
	test('the selector finds any aria-current value (a day strip uses "date"), not "false"', () => {
		expect(CURRENT_ITEM).toContain('[aria-current]');
		expect(CURRENT_ITEM).toContain(':not([aria-current="false"])');
		expect(CURRENT_ITEM).toContain('[aria-selected="true"]');
		let asked = '';
		const row = { ...strip('x'), querySelector: (sel: string) => ((asked = sel), null) };
		revealCurrent(row as unknown as HTMLElement, '2026-11-22');
		expect(asked).toBe(CURRENT_ITEM);
	});
});
