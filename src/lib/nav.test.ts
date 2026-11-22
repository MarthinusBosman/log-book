import { describe, expect, test } from 'bun:test';
import { navActive, staffNav, visibleStaffNav } from './nav.ts';

const item = (slug: string) => [...staffNav, { slug: 'team', label: 'Team', icon: 'team' as const, description: '' }].find((i) => i.slug === slug)!;

describe('navActive', () => {
	test('matches the page and its sub-pages, not a longer slug sharing the prefix', () => {
		expect(navActive(item('teams'), '/app/teams')).toBe(true);
		expect(navActive(item('team'), '/app/teams')).toBe(false);
		expect(navActive(item('team'), '/app/team')).toBe(true);
		expect(navActive(item('team'), '/app/team/abc')).toBe(true);
		expect(navActive(item(''), '/app')).toBe(true);
		expect(navActive(item(''), '/app/manifest')).toBe(false);
	});
	test('Dropzone teams shows only with teams.manage', () => {
		expect(visibleStaffNav(['teams.manage']).map((i) => i.slug)).toContain('teams');
		expect(visibleStaffNav(['loads.view', 'checkin.manage']).map((i) => i.slug)).not.toContain('teams');
	});
});
