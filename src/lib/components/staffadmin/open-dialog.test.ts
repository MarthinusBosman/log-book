import { describe, expect, test } from 'bun:test';
import { newDialogHref, openInPlace, viewParamsHref, wantsNewDialog } from './open-dialog.ts';

describe('newDialogHref', () => {
	test('adds new=1 and keeps the other params', () => {
		expect(newDialogHref(new URL('https://x.test/app/tandems?day=2026-11-15&q=ann'))).toBe('?day=2026-11-15&q=ann&new=1');
		expect(newDialogHref(new URL('https://x.test/app/aircraft'))).toBe('?new=1');
	});
	test('drops the listed params and does not repeat new', () => {
		expect(newDialogHref(new URL('https://x.test/app/tandems?day=2026-11-15&p=abc&created=1'), ['p', 'created'])).toBe('?day=2026-11-15&new=1');
		expect(newDialogHref(new URL('https://x.test/app/gear?new=1&tab=members'))).toBe('?new=1&tab=members');
	});
});

describe('viewParamsHref', () => {
	test('sets and removes params, keeping the rest', () => {
		const u = new URL('https://x.test/app/waivers?tab=sport&new=1');
		expect(viewParamsHref(u, { edit: 'abc', new: null })).toBe('?tab=sport&edit=abc');
		expect(viewParamsHref(u, { new: null })).toBe('?tab=sport');
	});
	test('falls back to the bare path when nothing is left', () => {
		expect(viewParamsHref(new URL('https://x.test/app/waivers?new=1'), { new: null })).toBe('/app/waivers');
	});
	test('drops a form action left in the URL by a no-JS post', () => {
		expect(viewParamsHref(new URL('https://x.test/app/gear?/create'), { show: 'available' })).toBe('?show=available');
		expect(viewParamsHref(new URL('https://x.test/app/gear?q=a&/ground'), { show: null })).toBe('?q=a');
		expect(viewParamsHref(new URL('https://x.test/app/gear?/create'), { show: null })).toBe('/app/gear');
	});
});

describe('wantsNewDialog', () => {
	test('only new=1 counts', () => {
		expect(wantsNewDialog(new URLSearchParams('new=1'))).toBe(true);
		expect(wantsNewDialog(new URLSearchParams('new=0'))).toBe(false);
		expect(wantsNewDialog(new URLSearchParams(''))).toBe(false);
	});
});

describe('openInPlace', () => {
	const click = (over: Partial<MouseEvent> = {}) => {
		let prevented = false;
		const e = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: () => (prevented = true), ...over } as MouseEvent;
		return { e, prevented: () => prevented };
	};
	test('plain click opens in place instead of following the link', () => {
		let opened = 0;
		const c = click();
		openInPlace(() => opened++)(c.e);
		expect(opened).toBe(1);
		expect(c.prevented()).toBe(true);
	});
	test('modified or middle clicks follow the link', () => {
		for (const over of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
			let opened = 0;
			const c = click(over);
			openInPlace(() => opened++)(c.e);
			expect(opened).toBe(0);
			expect(c.prevented()).toBe(false);
		}
	});
});
