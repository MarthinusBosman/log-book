import type { IconName } from '#lib/ui/Icon.svelte';
import type { Capability } from '#lib/domain/constants.ts';

export type NavItem = {
	/** URL segment under /app (empty string = dashboard). */
	slug: string;
	label: string;
	/** Short label for the mobile tab bar. */
	short?: string;
	icon: IconName;
	description: string;
	/** Staff items: shown when the user has ANY of these capabilities at the current dropzone. */
	caps?: readonly Capability[];
};

/** Back-office navigation for dropzone staff roles. `caps` mirror each page's own permission check. */
export const staffNav: NavItem[] = [
	{ slug: '', label: 'Dashboard', short: 'Home', icon: 'dashboard', description: 'Your day at the dropzone.' },
	{ slug: 'manifest', label: 'Loads / Manifest', short: 'Manifest', icon: 'manifest', description: 'Build loads, assign slots, call times and track the day.', caps: ['loads.view', 'manifest'] },
	{ slug: 'tandems', label: 'Tandems', icon: 'tandem', description: 'Bookings, students, instructors and media.', caps: ['tandems.manage'] },
	{ slug: 'jumpers', label: 'Jumpers', icon: 'users', description: 'Licences, currency, reserves and account balances.', caps: ['checkin.manage', 'payments.manage', 'staff.manage', 'manifest'] },
	{ slug: 'staff', label: 'Staff', icon: 'staff', description: 'Instructors, pilots, packers and ratings.', caps: ['staff.manage', 'reports.view'] },
	{ slug: 'aircraft', label: 'Aircraft', icon: 'plane', description: 'Fleet, capacity, maintenance and fuel.', caps: ['aircraft.manage'] },
	{ slug: 'gear', label: 'Gear', icon: 'parachute', description: 'Rental and student rigs, reserve repacks and AAD service.', caps: ['gear.manage'] },
	{ slug: 'waivers', label: 'Waivers', icon: 'waiver', description: 'Digital waivers and signatures.', caps: ['indemnity.manage', 'tandems.manage', 'checkin.manage'] },
	{ slug: 'pricelist', label: 'Pricelist', icon: 'tag', description: 'Slot prices, tickets, packages and extras.', caps: ['pricing.manage'] },
	{ slug: 'reports', label: 'Reports', icon: 'chart', description: 'Revenue, jumps, utilisation and exports.', caps: ['reports.view'] },
	{ slug: 'display', label: 'Display', icon: 'display', description: 'Big-screen manifest board for the hangar.', caps: ['loads.view'] },
	{ slug: 'settings', label: 'Settings', icon: 'settings', description: 'Dropzone profile, members and roles.', caps: ['dz.settings', 'staff.manage'] }
];

/** Personal navigation for every jumper. */
export const jumperNav: NavItem[] = [
	{ slug: 'logbook', label: 'Logbook', icon: 'book', description: 'Every jump, signed and synced.' },
	{ slug: 'check-in', label: 'Check-in', icon: 'checkin', description: 'Check in at the dropzone and manifest yourself.' },
	{ slug: 'my-gear', label: 'Gear', icon: 'parachute', description: 'Your rigs, reserve repack and AAD dates.' },
	{ slug: 'wallet', label: 'Wallet', icon: 'wallet', description: 'Jump tickets and account balance per dropzone.' },
	{ slug: 'team', label: 'Team', icon: 'team', description: 'Your teams and groups.' },
	{ slug: 'dropzones', label: 'Dropzones', icon: 'globe', description: 'Find dropzones, follow your favourites and check in.' },
	{ slug: 'profile', label: 'Profile', icon: 'user', description: 'Licences, ratings, documents and contact details.' }
];

/** Staff items the user may open at the current dropzone (the dashboard is always first). */
export function visibleStaffNav(caps: readonly Capability[]): NavItem[] {
	return staffNav.filter((i) => !i.caps || i.caps.some((c) => caps.includes(c)));
}

const bySlug = (slug: string) => [...staffNav, ...jumperNav].find((i) => i.slug === slug)!;

/**
 * Mobile bottom tabs (four destinations; the layout adds a "More" tab that opens the full menu).
 * Jumpers get their jump-day actions; staff who see loads swap one for Manifest.
 */
export function mobileTabs(caps: readonly Capability[]): NavItem[] {
	if (caps.includes('manifest')) return ['', 'manifest', 'check-in', 'logbook'].map(bySlug);
	if (caps.includes('loads.view')) return ['', 'manifest', 'logbook', 'check-in'].map(bySlug);
	return ['', 'check-in', 'logbook', 'wallet'].map(bySlug);
}
