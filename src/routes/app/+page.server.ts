import { activeDropzone } from '#lib/server/manifest/context.ts';
import { staffToday } from '#lib/server/manifest/board.ts';
import { loadJumperDashboard } from '#lib/server/jumper/dashboard.ts';
import { setupChecklist, setupPending } from '#lib/server/staffadmin/setup.ts';
import { requestDropzone } from '#lib/server/request-cache.ts';
import type { Actions, PageServerLoad } from './$types';

/** Cookie set by "Not now" on the dashboard's add-a-photo card. */
const PHOTO_PROMPT_COOKIE = 'dz_photo_prompt';

/** Dashboard: staff numbers + next load (manifest module, staff only) and the jumper half (everyone). */
export const load: PageServerLoad = async (event) => {
	event.depends('manifest:today');
	const { user, current } = await event.parent();
	const now = Date.now();
	const ctx = await activeDropzone(event);
	const staffView = ctx && ctx.caps.includes('loads.view') ? ctx : null;
	const [today, jumper, setup] = await Promise.all([
		staffView ? staffToday(event.locals.db, staffView.dz, now) : Promise.resolve(null),
		loadJumperDashboard(event.locals.db, user.id, current?.dropzone.id ?? null, now, (id) => requestDropzone(event.locals, id)),
		ctx && ctx.caps.includes('dz.settings') ? setupChecklist(event.locals.db, ctx.dz) : Promise.resolve(null)
	]);
	return {
		staffToday: today,
		staffTz: staffView?.dz.timezone ?? 'UTC',
		serverNow: now,
		jumper,
		/** Owner/admin onboarding steps; null when not allowed or everything is done. */
		setup: setup && setupPending(setup) ? setup : null,
		/** Small onboarding card: jumpers without a profile picture (dismissible, remembered for a year). */
		photoPrompt: !user.avatar && event.cookies.get(PHOTO_PROMPT_COOKIE) !== 'dismissed',
		hours: ctx ? { openDays: ctx.dz.openDays, openTime: ctx.dz.openTime, closeTime: ctx.dz.closeTime, timezone: ctx.dz.timezone } : null
	};
};

export const actions: Actions = {
	dismissPhotoPrompt: async ({ cookies, url }) => {
		cookies.set(PHOTO_PROMPT_COOKIE, 'dismissed', { path: '/app', maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:' });
		return { success: true };
	}
};
