import { redirect } from '@sveltejs/kit';
import { instanceMode } from '#lib/server/config.ts';
import { DZ_COOKIE, hasStaffRole, listMemberships } from '#lib/server/dropzones/index.ts';
import { unreadCount } from '#lib/server/domain/notifications.ts';
import { capabilitiesOf } from '#lib/server/domain/permissions.ts';
import { brandingFor } from '#lib/server/branding.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}
	const [memberships, unread] = await Promise.all([
		listMemberships(locals.db, locals.user.id),
		unreadCount(locals.db, locals.user.id)
	]);
	const selected = cookies.get(DZ_COOKIE);
	const current = memberships.find((m) => m.dropzone.slug === selected) ?? memberships[0] ?? null;
	/** The active dropzone's colours + logo re-skin the whole shell (SSR, no flash). */
	const branding = await brandingFor(locals.db, current?.dropzone.id);

	return {
		user: locals.user,
		memberships,
		current,
		isStaff: hasStaffRole(current?.roles),
		/** Capabilities at the current dropzone — drives role-appropriate navigation. */
		caps: capabilitiesOf(current?.roles ?? []),
		instanceMode: instanceMode(),
		unread,
		branding
	};
};
