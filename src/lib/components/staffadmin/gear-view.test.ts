import { describe, expect, test } from 'bun:test';
import { gearViewHref, readGearView } from './gear-view.ts';

const base = 'https://log-book.app/app/gear';
const none = { tab: 'dz', only: '', adding: false, allMembers: false } as const;

describe('gear page view in the URL', () => {
	test('reads tab, filter, the add dialog and "show all"; ignores unknown values', () => {
		expect(readGearView(new URL(`${base}?tab=members&show=attention&new=1&all=1`).searchParams)).toEqual({
			tab: 'members',
			only: 'attention',
			adding: true,
			allMembers: true
		});
		expect(readGearView(new URL(`${base}?tab=nope&show=bogus&new=yes&all=true`).searchParams)).toEqual(none);
		expect(readGearView(new URL(base).searchParams)).toEqual(none);
	});

	test('writes only non-defaults and keeps other params', () => {
		expect(gearViewHref(base, none)).toBe(base);
		// "Show all" belongs to the Jumpers' gear tab only.
		expect(gearViewHref(`${base}?all=1`, { ...none, allMembers: true })).toBe(base);
		expect(gearViewHref(`${base}?tab=members&show=grounded&new=1&all=1`, none)).toBe(base);
		expect(gearViewHref(`${base}?dz=abc`, { tab: 'members', only: 'in_use', adding: true, allMembers: true })).toBe(
			`${base}?dz=abc&tab=members&show=in_use&new=1&all=1`
		);
	});

	test('round-trips', () => {
		const view = { tab: 'members', only: 'grounded', adding: false, allMembers: true } as const;
		expect(readGearView(new URL(gearViewHref(base, view)).searchParams)).toEqual(view);
	});
});
