import { error, redirect } from '@sveltejs/kit';
import { deleteRig, getRig, listServiceHistory, recordService, updateRig } from '#lib/server/domain/gear.ts';
import { DomainError } from '#lib/server/domain/errors.ts';
import { domainFail, opt, requireUser, str } from '#lib/server/jumper/forms.ts';
import { gearContext, parseRigForm, rigFormEcho, rigView } from '#lib/server/jumper/gear.ts';
import { GEAR_SERVICE_KINDS, type GearServiceKind } from '#lib/domain/constants.ts';
import type { Actions, PageServerLoad } from './$types';

async function ownRig(locals: App.Locals, userId: string, id: string) {
	const rig = await getRig(locals.db, id);
	if (!rig || rig.userId !== userId) error(404, 'Rig not found');
	return rig;
}

export const load: PageServerLoad = async ({ locals, params, url, parent }) => {
	const user = requireUser(locals, url);
	const { current } = await parent();
	const rig = await ownRig(locals, user.id, params.id);
	const [ctx, history] = await Promise.all([gearContext(locals.db, user.id, current?.dropzone.id), listServiceHistory(locals.db, rig.id)]);
	return {
		ctx,
		rig: rigView(rig, ctx),
		history: history.map((h) => ({ id: h.id, kind: h.kind, performedOn: h.performedOn, by: h.performedByName, riggerNumber: h.riggerNumber, notes: h.notes })),
		added: url.searchParams.has('added')
	};
};

export const actions: Actions = {
	update: async ({ locals, request, params }) => {
		const user = requireUser(locals);
		const rig = await ownRig(locals, user.id, params.id);
		const form = await request.formData();
		try {
			const ctx = await gearContext(locals.db, user.id, null);
			await updateRig(locals.db, rig.id, parseRigForm(form, ctx.exitWeightKg));
		} catch (e) {
			return domainFail(e, { action: 'update', values: rigFormEcho(form) });
		}
		return { action: 'update', success: 'Gear info updated successfully' };
	},
	service: async ({ locals, request, params }) => {
		const user = requireUser(locals);
		const rig = await ownRig(locals, user.id, params.id);
		const form = await request.formData();
		try {
			const kind = str(form, 'kind') as GearServiceKind;
			if (!GEAR_SERVICE_KINDS.includes(kind)) throw new DomainError('invalid', 'Choose what was done');
			await recordService(locals.db, {
				rigId: rig.id,
				kind,
				performedOn: str(form, 'performedOn'),
				performedByName: opt(form, 'performedByName'),
				riggerNumber: opt(form, 'riggerNumber'),
				notes: opt(form, 'notes'),
				nextDueOn: opt(form, 'nextDueOn')
			});
		} catch (e) {
			return domainFail(e, { action: 'service' });
		}
		return { action: 'service', success: 'Service recorded' };
	},
	retire: async ({ locals, params }) => {
		const user = requireUser(locals);
		const rig = await ownRig(locals, user.id, params.id);
		await updateRig(locals.db, rig.id, { active: !rig.active });
		return { action: 'retire', success: rig.active ? 'Rig retired' : 'Rig back in service' };
	},
	delete: async ({ locals, params }) => {
		const user = requireUser(locals);
		const rig = await ownRig(locals, user.id, params.id);
		await deleteRig(locals.db, rig.id);
		redirect(303, '/app/my-gear');
	}
};
