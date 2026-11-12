import { loadSheet } from '#lib/server/domain/staff-admin.ts';
import { isIsoDate } from '#lib/server/domain/time.ts';
import { loadStats } from '#lib/server/domain/loads.ts';
import { requirePage } from '#lib/server/staffadmin/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'reports.view', 'manifest');
	const q = event.url.searchParams.get('day');
	const day = q && isIsoDate(q) ? q : ctx.today;
	const only = event.url.searchParams.get('load');
	let loads = await loadSheet(event.locals.db, ctx.dz.id, day);
	if (only) loads = loads.filter((l) => String(l.loadNumber) === only || l.id === only);
	return {
		day,
		today: ctx.today,
		dzName: ctx.dz.name,
		loads: loads.map((l) => {
			const stats = loadStats(l, l.slots);
			return {
				id: l.id,
				loadNumber: l.loadNumber,
				status: l.status,
				aircraftName: l.aircraftName,
				capacity: l.capacity,
				weightLimitKg: l.weightLimitKg,
				pilotName: l.pilotName,
				pilotWeightKg: l.pilotWeightKg,
				scheduledAt: l.scheduledAt,
				departedAt: l.departedAt,
				stats,
				slots: l.slots.map((s) => ({
					id: s.id,
					displayName: s.displayName,
					licence: s.licence,
					weightKg: s.weightKg,
					jumpType: s.jumpType,
					staffRole: s.staffRole,
					isLoadMaster: s.isLoadMaster,
					extras: s.extras,
					teamName: s.teamName,
					paid: s.paid,
					note: s.note
				}))
			};
		})
	};
};
