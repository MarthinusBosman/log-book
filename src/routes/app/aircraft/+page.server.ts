import { fail } from '@sveltejs/kit';
import { and, count, eq, gte, inArray } from 'drizzle-orm';
import { aircraft, loads, users } from '#lib/server/db/schema.ts';
import { createAircraft, deleteAircraft, listAircraft, updateAircraft, type AircraftInput } from '#lib/server/domain/dropzone-admin.ts';
import { listUsersWithRole } from '#lib/server/domain/permissions.ts';
import { addDays } from '#lib/server/domain/time.ts';
import { optNum, optStr, requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'aircraft.manage');
	const db = event.locals.db;
	const since = addDays(ctx.today, -29);
	const [fleet, pilots, usage] = await Promise.all([
		listAircraft(db, ctx.dz.id),
		listUsersWithRole(db, ctx.dz.id, 'pilot'),
		db
			.select({ aircraftId: loads.aircraftId, n: count() })
			.from(loads)
			.where(and(eq(loads.dropzoneId, ctx.dz.id), eq(loads.status, 'completed'), gte(loads.day, since)))
			.groupBy(loads.aircraftId)
	]);
	const pilotLoads = await db
		.select({ pilot: loads.pilotUserId, n: count() })
		.from(loads)
		.where(and(eq(loads.dropzoneId, ctx.dz.id), eq(loads.status, 'completed'), gte(loads.day, since)))
		.groupBy(loads.pilotUserId);
	const weights = pilots.length
		? await db.select({ id: users.id, w: users.weightKg }).from(users).where(inArray(users.id, pilots.map((p) => p.id)))
		: [];
	const wById = new Map(weights.map((w) => [w.id, w.w]));
	return {
		fleet: fleet.map((a) => ({ ...a, loads30: usage.find((u) => u.aircraftId === a.id)?.n ?? 0 })),
		pilots: pilots.map((p) => ({
			...p,
			weightKg: wById.get(p.id) ?? null,
			loads30: pilotLoads.find((l) => l.pilot === p.id)?.n ?? 0,
			planes: fleet.filter((a) => a.defaultPilotId === p.id).map((a) => a.name)
		}))
	};
};

async function parse(f: FormData, dzId: string, db: App.Locals['db']): Promise<AircraftInput | string> {
	const name = str(f, 'name');
	if (!name) return 'Enter the plane name.';
	const capacity = optNum(f, 'capacity');
	if (capacity === null || capacity === 'invalid' || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) return 'Pax must be a whole number between 1 and 100.';
	const weight = optNum(f, 'weightLimitKg');
	if (weight === 'invalid' || (weight !== null && (weight <= 0 || weight > 20000))) return 'Weight limit must be a positive number of kg.';
	const pilotId = optStr(f, 'defaultPilotId');
	if (pilotId) {
		const ok = (await listUsersWithRole(db, dzId, 'pilot')).some((p) => p.id === pilotId);
		if (!ok) return 'The default pilot must have the pilot role.';
	}
	return {
		name,
		tailNumber: optStr(f, 'tailNumber')?.toUpperCase() ?? null,
		capacity,
		weightLimitKg: weight,
		defaultPilotId: pilotId,
		active: f.has('active') ? f.getAll('active').some((v) => v === 'on') : true
	};
}

async function ownPlane(db: App.Locals['db'], dzId: string, id: string) {
	return (await db.select().from(aircraft).where(and(eq(aircraft.id, id), eq(aircraft.dropzoneId, dzId))).limit(1))[0];
}

export const actions: Actions = {
	create: (event) =>
		runAction(event, 'aircraft.manage', async ({ dz }) => {
			const input = await parse(await event.request.formData(), dz.id, event.locals.db);
			if (typeof input === 'string') return fail(400, { message: input });
			const a = await createAircraft(event.locals.db, dz.id, input);
			return { message: `${a.name} added to the fleet` };
		}),
	update: (event) =>
		runAction(event, 'aircraft.manage', async ({ dz }) => {
			const f = await event.request.formData();
			const plane = await ownPlane(event.locals.db, dz.id, str(f, 'id'));
			if (!plane) return fail(404, { message: 'That plane no longer exists.' });
			const input = await parse(f, dz.id, event.locals.db);
			if (typeof input === 'string') return fail(400, { message: input });
			await updateAircraft(event.locals.db, plane.id, input);
			return { message: 'Plane info updated' };
		}),
	delete: (event) =>
		runAction(event, 'aircraft.manage', async ({ dz }) => {
			const plane = await ownPlane(event.locals.db, dz.id, str(await event.request.formData(), 'id'));
			if (!plane) return fail(404, { message: 'That plane no longer exists.' });
			await deleteAircraft(event.locals.db, plane.id);
			return { message: `${plane.name} deleted. Past loads keep their plane name.` };
		})
};
