import { describe, expect, test } from 'bun:test';
import { gearViewHref, readGearView } from './gear-view.ts';

const base = 'https://log-book.app/app/gear';

describe('gear page view in the URL', () => {
	test('reads tab, filter and the add dialog; ignores unknown values', () => {
		expect(readGearView(new URL(`${base}?tab=members&show=attention&new=1`).searchParams)).toEqual({ tab: 'members', only: 'attention', adding: true });
		expect(readGearView(new URL(`${base}?tab=nope&show=bogus&new=yes`).searchParams)).toEqual({ tab: 'dz', only: '', adding: false });
		expect(readGearView(new URL(base).searchParams)).toEqual({ tab: 'dz', only: '', adding: false });
	});

	test('writes only non-defaults and keeps other params', () => {
		expect(gearViewHref(base, { tab: 'dz', only: '', adding: false })).toBe(base);
		expect(gearViewHref(`${base}?tab=members&show=grounded&new=1`, { tab: 'dz', only: '', adding: false })).toBe(base);
		expect(gearViewHref(`${base}?dz=abc`, { tab: 'members', only: 'in_use', adding: true })).toBe(`${base}?dz=abc&tab=members&show=in_use&new=1`);
	});

	test('round-trips', () => {
		const view = { tab: 'members', only: 'grounded', adding: false } as const;
		expect(readGearView(new URL(gearViewHref(base, view)).searchParams)).toEqual(view);
	});
});
