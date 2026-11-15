import { activeDropzone } from '#lib/server/manifest/context.ts';
import { staffToday } from '#lib/server/manifest/board.ts';
import type { LayoutServerLoad } from './$types';

/**
 * Live half of the dashboard: StaffToday polls `invalidate('manifest:today')` every 15 s. Keeping it
 * in its own load means a poll re-runs only these few reads, not the whole dashboard (jumper
 * logbook/wallet/gear, setup checklist, top-ups). The page load must not call `parent()`, or it
 * would re-run with this one.
 */
export const load: LayoutServerLoad = async (event) => {
	event.depends('manifest:today');
	const now = Date.now();
	const ctx = await activeDropzone(event);
	const staffView = ctx && ctx.caps.includes('loads.view') ? ctx : null;
	return {
		staffToday: staffView ? await staffToday(event.locals.db, staffView.dz, now) : null,
		staffTz: staffView?.dz.timezone ?? 'UTC',
		serverNow: now
	};
};
