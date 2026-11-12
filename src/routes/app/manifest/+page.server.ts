import { error } from '@sveltejs/kit';
import { listAircraft } from '#lib/server/domain/dropzone-admin.ts';
import { listUsersWithRole } from '#lib/server/domain/permissions.ts';
import { isIsoDate, localDate } from '#lib/server/domain/time.ts';
import { boardLoads } from '#lib/server/manifest/board.ts';
import { requireDropzone } from '#lib/server/manifest/context.ts';
import { loadActions } from '#lib/server/manifest/actions.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	event.depends('manifest:board');
	const ctx = await requireDropzone(event, 'loads.view');
	const now = Date.now();
	const today = localDate(now, ctx.dz.timezone);
	const q = event.url.searchParams.get('day');
	if (q && !isIsoDate(q)) error(400, 'Invalid date');
	const day = q ?? today;
	const canManifest = ctx.caps.includes('manifest');
	const [loads, aircraft, pilots] = await Promise.all([
		boardLoads(event.locals.db, ctx.dz, day),
		canManifest ? listAircraft(event.locals.db, ctx.dz.id, { activeOnly: true }) : [],
		canManifest ? listUsersWithRole(event.locals.db, ctx.dz.id, 'pilot') : []
	]);
	return {
		dz: { id: ctx.dz.id, name: ctx.dz.name, slug: ctx.dz.slug, currency: ctx.dz.currency, timezone: ctx.dz.timezone, defaultCapacity: ctx.dz.settings.defaultCapacity ?? null },
		day,
		today,
		serverNow: now,
		loads,
		aircraft: aircraft.map((a) => ({ id: a.id, name: a.name, capacity: a.capacity, weightLimitKg: a.weightLimitKg, defaultPilotId: a.defaultPilotId })),
		pilots: pilots.map((p) => ({ id: p.id, name: p.name, weightKg: p.weightKg })),
		canManifest,
		canPay: ctx.caps.includes('payments.manage')
	};
};

export const actions: Actions = { ...loadActions };
