import type { Capability } from '#lib/domain/constants.ts';
import type { IconName } from '#lib/ui/Icon.svelte';

export type SettingsTab = {
	/** Path under /app/settings ('' = the index page). */
	slug: string;
	label: string;
	icon: IconName;
	/** Shown when the user has any of these (empty = everyone). */
	anyOf: Capability[];
};

/**
 * Settings sub-navigation. Other modules add their tab here (e.g. `linked-accounts`, `import`)
 * plus a route folder under src/routes/app/settings/<slug>/.
 */
export const settingsTabs: SettingsTab[] = [
	{ slug: '', label: 'Dropzone', icon: 'parachute', anyOf: ['dz.settings'] },
	{ slug: 'branding', label: 'Branding', icon: 'sun', anyOf: ['dz.settings'] },
	{ slug: 'features', label: 'Features', icon: 'zap', anyOf: ['dz.settings'] },
	{ slug: 'payments', label: 'Payments', icon: 'wallet', anyOf: ['dz.settings'] },
	{ slug: 'members', label: 'Members & roles', icon: 'users', anyOf: ['staff.manage'] },
	{ slug: 'import', label: 'Import', icon: 'server', anyOf: ['dz.settings'] },
	{ slug: 'federation', label: 'Federation', icon: 'globe', anyOf: ['dz.settings'] },
	{ slug: 'linked-accounts', label: 'Linked accounts', icon: 'user', anyOf: [] }
];

export function visibleSettingsTabs(caps: readonly Capability[]): SettingsTab[] {
	return settingsTabs.filter((t) => t.anyOf.length === 0 || t.anyOf.some((c) => caps.includes(c)));
}
