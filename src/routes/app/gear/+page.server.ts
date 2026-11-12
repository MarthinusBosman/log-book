import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { rigs } from '#lib/server/db/schema.ts';
import { createRig, deleteRig, recordService, updateRig, type RigInput } from '#lib/server/domain/gear.ts';
import { gearRegister, memberGearDue } from '#lib/server/domain/staff-admin.ts';
import { isIsoDate } from '#lib/server/domain/time.ts';
import { GEAR_SERVICE_KINDS, type GearServiceKind, type RigKind } from '#lib/domain/constants.ts';
import { optNum, optStr, requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import type { Actions, PageServerLoad } from './$types';

const DZ_KINDS: RigKind[] = ['rental', 'student', 'tandem'];

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'gear.manage');
	const db = event.locals.db;
	const [register, members] = await Promise.all([gearRegister(db, ctx.dz.id, ctx.today), memberGearDue(db, ctx.dz.id, ctx.today)]);
	return {
		today: ctx.today,
		register,
		members: members.map((m) => ({
			rigId: m.rig.id,
			rigName: m.rig.name ?? m.rig.container ?? 'Rig',
			container: m.rig.container,
			aad: m.rig.aad,
			owner: m.owner,
			repack: m.repack,
			aad_: m.aad
		}))
	};
};

function parseRig(f: FormData): RigInput | string {
	const kind = str(f, 'kind') as RigKind;
	if (!DZ_KINDS.includes(kind)) return 'Pick rental, student or tandem.';
	const name = optStr(f, 'name');
	if (!name) return 'Give the rig a name or number (e.g. "Student 4").';
	const dates = ['reserveRepackedOn', 'aadServiceDueOn', 'aadExpiresOn'] as const;
	const out: Record<string, string | null> = {};
	for (const d of dates) {
		const v = optStr(f, d);
		if (v && !isIsoDate(v)) return 'Dates must be valid (YYYY-MM-DD).';
		out[d] = v;
	}
	if (!out.reserveRepackedOn) return 'Enter the last reserve repack date.';
	const ints: Record<string, number | null> = {};
	for (const k of ['mainSizeSqft', 'reserveSizeSqft', 'repackIntervalDays'] as const) {
		const n = optNum(f, k);
		if (n === 'invalid' || (n !== null && (!Number.isInteger(n) || n <= 0 || n > 1000))) return 'Sizes and interval must be positive whole numbers.';
		ints[k] = n;
	}
	return {
		kind,
		name,
		container: optStr(f, 'container'),
		mainCanopy: optStr(f, 'mainCanopy'),
		mainSizeSqft: ints.mainSizeSqft,
		reserveCanopy: optStr(f, 'reserveCanopy'),
		reserveSizeSqft: ints.reserveSizeSqft,
		reserveRepackedOn: out.reserveRepackedOn,
		repackIntervalDays: ints.repackIntervalDays,
		aad: optStr(f, 'aad'),
		aadSerial: optStr(f, 'aadSerial'),
		aadServiceDueOn: out.aadServiceDueOn,
		aadExpiresOn: out.aadExpiresOn,
		notes: optStr(f, 'notes')
	};
}

async function ownRig(db: App.Locals['db'], dzId: string, id: string) {
	return (await db.select().from(rigs).where(and(eq(rigs.id, id), eq(rigs.dropzoneId, dzId))).limit(1))[0];
}

export const actions: Actions = {
	create: (event) =>
		runAction(event, 'gear.manage', async ({ dz }) => {
			const input = parseRig(await event.request.formData());
			if (typeof input === 'string') return fail(400, { message: input });
			const rig = await createRig(event.locals.db, { dropzoneId: dz.id }, input);
			return { message: `${rig.name} added to the register` };
		}),
	update: (event) =>
		runAction(event, 'gear.manage', async ({ dz }) => {
			const f = await event.request.formData();
			const rig = await ownRig(event.locals.db, dz.id, str(f, 'id'));
			if (!rig) return fail(404, { message: 'That rig no longer exists.' });
			const input = parseRig(f);
			if (typeof input === 'string') return fail(400, { message: input });
			await updateRig(event.locals.db, rig.id, input);
			return { message: 'Rig updated' };
		}),
	ground: (event) =>
		runAction(event, 'gear.manage', async ({ dz }) => {
			const f = await event.request.formData();
			const rig = await ownRig(event.locals.db, dz.id, str(f, 'id'));
			if (!rig) return fail(404, { message: 'That rig no longer exists.' });
			const active = str(f, 'active') === 'true';
			await updateRig(event.locals.db, rig.id, { active });
			return { message: active ? `${rig.name} back in service` : `${rig.name} grounded` };
		}),
	service: (event) =>
		runAction(event, 'gear.manage', async ({ dz, user }) => {
			const f = await event.request.formData();
			const rig = await ownRig(event.locals.db, dz.id, str(f, 'id'));
			if (!rig) return fail(404, { message: 'That rig no longer exists.' });
			const kind = str(f, 'kind') as GearServiceKind;
			if (!GEAR_SERVICE_KINDS.includes(kind)) return fail(400, { message: 'Pick what was done.' });
			const performedOn = str(f, 'performedOn');
			if (!isIsoDate(performedOn)) return fail(400, { message: 'Enter the date the work was done.' });
			const nextDueOn = optStr(f, 'nextDueOn');
			if (nextDueOn && !isIsoDate(nextDueOn)) return fail(400, { message: 'Next due date is not a valid date.' });
			if (kind === 'aad_service' && !nextDueOn) return fail(400, { message: 'Enter when the next AAD service is due.' });
			await recordService(event.locals.db, {
				rigId: rig.id,
				kind,
				performedOn,
				performedByUserId: user.id,
				riggerNumber: optStr(f, 'riggerNumber'),
				notes: optStr(f, 'notes'),
				nextDueOn
			});
			return { message: kind === 'reserve_repack' ? `Repack recorded for ${rig.name}` : `Service recorded for ${rig.name}` };
		}),
	delete: (event) =>
		runAction(event, 'gear.manage', async ({ dz }) => {
			const rig = await ownRig(event.locals.db, dz.id, str(await event.request.formData(), 'id'));
			if (!rig) return fail(404, { message: 'That rig no longer exists.' });
			await deleteRig(event.locals.db, rig.id);
			return { message: `${rig.name} removed` };
		})
};
