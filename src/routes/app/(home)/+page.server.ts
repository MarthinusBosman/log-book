import { activeDropzone } from '#lib/server/manifest/context.ts';
import { loadJumperDashboard } from '#lib/server/jumper/dashboard.ts';
import { setupChecklist, setupPending } from '#lib/server/staffadmin/setup.ts';
import { currentMembership, requestDropzone } from '#lib/server/request-cache.ts';
import { gearAttention } from '#lib/server/domain/staff-admin.ts';
import { localDate } from '#lib/server/domain/time.ts';
import { listPendingTopUpsForDropzone } from '#lib/server/domain/payments.ts';
import type { Actions, PageServerLoad } from './$types';

/** Cookie set by "Not now" on the dashboard's add-a-photo card. */
const PHOTO_PROMPT_COOKIE = 'dz_photo_prompt';

/**
 * Dashboard: the jumper half (everyone) + staff cards. The live staff numbers come from
 * `(home)/+layout.server.ts`. No `parent()` and no `manifest:today` dependency here, so the
 * 15 s StaffToday poll doesn't re-run this load.
 */
export const load: PageServerLoad = async (event) => {
	const ctx = await activeDropzone(event); // redirects to /login when signed out
	const user = event.locals.user!;
	const current = await currentMembership(event, user.id);
	const now = Date.now();
	const canCollect = !!ctx && ctx.caps.includes('payments.manage') && ctx.dz.walletEnabled;
	const [jumper, setup, gear, topUps] = await Promise.all([
		loadJumperDashboard(event.locals.db, user.id, current?.dropzone.id ?? null, now, (id) => requestDropzone(event.locals, id)),
		ctx && ctx.caps.includes('dz.settings') ? setupChecklist(event.locals.db, ctx.dz) : Promise.resolve(null),
		ctx && ctx.caps.includes('gear.manage') ? gearAttention(event.locals.db, ctx.dz, localDate(now, ctx.dz.timezone)) : Promise.resolve(null),
		canCollect ? listPendingTopUpsForDropzone(event.locals.db, ctx.dz.id) : Promise.resolve([])
	]);
	return {
		jumper,
		/** Payment staff: jumpers who asked to top up their wallet at the desk (oldest first). */
		topUpsToCollect: topUps.map((t) => ({
			id: t.payment.id,
			userId: t.user.id,
			name: t.user.name,
			amountMinor: t.payment.amountMinor,
			currency: t.payment.currency
		})),
		/** Owner/admin onboarding steps; null when not allowed or everything is done. */
		setup: setup && setupPending(setup) ? setup : null,
		/** Riggers / gear managers: rigs needing attention (null when not allowed or nothing is due). */
		gear: gear && (gear.dzRigs || gear.memberRigs) ? gear : null,
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
