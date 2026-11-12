import { resolveCtx } from '#lib/server/staffadmin/context.ts';
import { visibleSettingsTabs } from '#lib/components/staffadmin/settingsTabs.ts';
import type { LayoutServerLoad } from './$types';

/**
 * Settings shell. Personal tabs (linked accounts) work without a dropzone; each page
 * enforces its own permissions (dropzone pages 404/403 on their own).
 */
export const load: LayoutServerLoad = async (event) => {
	const ctx = await resolveCtx(event);
	return { settingsTabs: visibleSettingsTabs(ctx?.caps ?? []), dzName: ctx?.dz.name ?? null };
};
