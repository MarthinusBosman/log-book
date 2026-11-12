import { redirect } from '@sveltejs/kit';
import { instanceMode } from '#lib/server/config.ts';
import { DZ_COOKIE, hasStaffRole } from '#lib/server/dropzones/index.ts';
import { unreadCount } from '#lib/server/domain/notifications.ts';
import { capabilitiesOf } from '#lib/server/domain/permissions.ts';
import { brandingView } from '#lib/server/branding.ts';
import { requestDropzone, requestMemberships } from '#lib/server/request-cache.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}
	const [memberships, unread] = await Promise.all([
		requestMemberships(locals, locals.user.id),
		unreadCount(locals.db, locals.user.id)
	]);
	const selected = cookies.get(DZ_COOKIE);
	const current = memberships.find((m) => m.dropzone.slug === selected) ?? memberships[0] ?? null;
	/** The active dropzone's colours + logo re-skin the whole shell (SSR, no flash). Row shared with page loads. */
	const dzRow = current ? await requestDropzone(locals, current.dropzone.id) : undefined;
	const branding = dzRow ? brandingView(dzRow) : null;

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
