/**
 * Form actions shared by /app/manifest (board) and /app/manifest/[loadId] (detail).
 * Every action checks capabilities against the dropzone that owns the load/slot.
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { slots, type Slot } from '../db/schema.ts';
import * as loadsSvc from '../domain/loads.ts';
import { manifestGroup, manifestTeam } from '../domain/teams.ts';
import { markSlotsPaid } from '../domain/payments.ts';
import { DomainError } from '../domain/errors.ts';
import { isIsoDate } from '../domain/time.ts';
import {
	JUMP_TYPES,
	SLOT_EXTRAS,
	SLOT_STAFF_ROLES,
	type JumpType,
	type SlotExtra,
	type SlotStaffRole
} from '../../domain/constants.ts';
import type { CompleteSummary } from '../../components/manifest/types.ts';
import { activeDropzone, bool, loadWithCap, optMoney, optNum, optStr, runAction, str } from './context.ts';
import { zonedTime } from './time.ts';
import { dropzones } from '../db/schema.ts';

type Ev = RequestEvent;

function jumpType(form: FormData, key = 'jumpType'): JumpType {
	const v = str(form, key);
	if (!(JUMP_TYPES as readonly string[]).includes(v)) throw new DomainError('invalid', 'Choose a jump type');
	return v as JumpType;
}
function extras(form: FormData): SlotExtra[] {
	return form
		.getAll('extras')
		.map(String)
		.filter((x): x is SlotExtra => (SLOT_EXTRAS as readonly string[]).includes(x));
}
function staffRole(form: FormData): SlotStaffRole | null {
	const v = str(form, 'staffRole');
	return (SLOT_STAFF_ROLES as readonly string[]).includes(v) ? (v as SlotStaffRole) : null;
}
function positiveWeight(n: number | null, label = 'Weight', max = 400): number | null {
	if (n == null) return null;
	if (n < 0 || n > max) throw new DomainError('invalid', `${label} must be between 0 and ${max} kg`);
	return n;
}
const LIMIT_MAX = 20_000;

async function currencyOf(ev: Ev, dropzoneId: string): Promise<string> {
	const r = await ev.locals.db.select({ c: dropzones.currency, tz: dropzones.timezone }).from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1);
	return r[0]?.c ?? 'USD';
}

async function slotWithCap(ev: Ev, slotId: string, cap: 'manifest' | 'payments.manage'): Promise<Slot> {
	const s = (await ev.locals.db.select().from(slots).where(eq(slots.id, slotId)).limit(1))[0];
	if (!s) throw new DomainError('not_found', 'That slot no longer exists');
	await loadWithCap(ev, s.loadId, cap);
	return s;
}

/** Wrap a "loadId"-based lifecycle action. */
function loadAction(name: string, fn: (ev: Ev, loadId: string, form: FormData, by: string) => Promise<Record<string, unknown> | void>) {
	return async (ev: Ev) => {
		const form = await ev.request.formData();
		const loadId = str(form, 'loadId');
		return runAction(name, async () => {
			const load = await loadWithCap(ev, loadId, 'manifest');
			const res = await fn(ev, load.id, form, ev.locals.user!.id);
			return { ok: true, action: name, loadId: load.id, ...(res ?? {}) };
		});
	};
}

export const loadActions = {
	createLoad: async (ev: Ev) => {
		const form = await ev.request.formData();
		const ctx = await activeDropzone(ev);
		if (!ctx) return fail(404, { action: 'createLoad', code: 'not_found', message: 'Join or create a dropzone first' });
		return runAction(
			'createLoad',
			async () => {
				if (!ctx.caps.includes('manifest')) throw new DomainError('forbidden', 'forbidden');
				const day = str(form, 'day');
				if (!isIsoDate(day)) throw new DomainError('invalid', 'Please select a date for the load/s');
				const time = str(form, 'time');
				const scheduledAt = time ? zonedTime(day, time, ctx.dz.timezone) : null;
				if (time && scheduledAt == null) throw new DomainError('invalid', 'Enter the time as HH:MM');
				const aircraftId = optStr(form, 'aircraftId');
				const pilotUserId = optStr(form, 'pilotUserId');
				const created = await loadsSvc.createLoads(ev.locals.db, {
					dropzoneId: ctx.dz.id,
					day,
					count: optNum(form, 'count') ?? 1,
					aircraftId,
					aircraftName: optStr(form, 'aircraftName') ?? undefined,
					capacity: optNum(form, 'capacity') ?? undefined,
					weightLimitKg: form.has('weightLimitKg') && str(form, 'weightLimitKg') !== '' ? positiveWeight(optNum(form, 'weightLimitKg'), 'Weight limit', LIMIT_MAX) ?? undefined : undefined,
					pilotUserId,
					pilotName: pilotUserId ? undefined : (optStr(form, 'pilotName') ?? undefined),
					pilotWeightKg: positiveWeight(optNum(form, 'pilotWeightKg'), 'Pilot weight') ?? undefined,
					requirements: optStr(form, 'requirements'),
					open: bool(form, 'open'),
					scheduledAt,
					createdBy: ctx.userId
				});
				return { ok: true, action: 'createLoad', created: created.map((l) => l.loadNumber) };
			},
			ctx.dz.currency
		);
	},

	updateLoad: loadAction('updateLoad', async (ev, loadId, form) => {
		const load = await loadsSvc.getLoad(ev.locals.db, loadId);
		const tz = (await ev.locals.db.select({ tz: dropzones.timezone }).from(dropzones).where(eq(dropzones.id, load.dropzoneId)).limit(1))[0]?.tz ?? 'UTC';
		const patch: loadsSvc.LoadPatch = {};
		const aircraftId = optStr(form, 'aircraftId');
		if (aircraftId && aircraftId !== load.aircraftId) patch.aircraftId = aircraftId;
		if (form.has('aircraftName') && !patch.aircraftId) patch.aircraftName = optStr(form, 'aircraftName');
		// when the plane changes, untouched capacity/limit fields follow the new aircraft
		const cap = optNum(form, 'capacity');
		if (cap != null && !(patch.aircraftId && cap === load.capacity)) patch.capacity = cap;
		const lim = positiveWeight(optNum(form, 'weightLimitKg'), 'Weight limit', LIMIT_MAX);
		if (form.has('weightLimitKg') && !(patch.aircraftId && lim === load.weightLimitKg)) patch.weightLimitKg = lim;
		const pilotUserId = optStr(form, 'pilotUserId');
		if (form.has('pilotUserId')) {
			if (pilotUserId && pilotUserId !== load.pilotUserId) patch.pilotUserId = pilotUserId;
			else if (!pilotUserId) {
				patch.pilotUserId = null;
				patch.pilotName = optStr(form, 'pilotName');
			}
		}
		const pw = positiveWeight(optNum(form, 'pilotWeightKg'), 'Pilot weight');
		if (form.has('pilotWeightKg') && !(patch.pilotUserId && pw === load.pilotWeightKg)) patch.pilotWeightKg = pw;
		if (form.has('requirements')) patch.requirements = optStr(form, 'requirements');
		if (form.has('time')) {
			const t = str(form, 'time');
			const at = t ? zonedTime(load.day, t, tz) : null;
			if (t && at == null) throw new DomainError('invalid', 'Enter the time as HH:MM');
			patch.scheduledAt = at;
		}
		await loadsSvc.updateLoad(ev.locals.db, loadId, patch);
	}),

	setOpen: loadAction('setOpen', async (ev, loadId, form) => {
		await loadsSvc.setLoadOpen(ev.locals.db, loadId, bool(form, 'open'));
	}),
	call: loadAction('call', async (ev, loadId, form, by) => {
		const minutes = optNum(form, 'minutes');
		if (bool(form, 'reset')) {
			const cur = await loadsSvc.getLoad(ev.locals.db, loadId);
			if (cur.status === 'called') await loadsSvc.cancelCall(ev.locals.db, loadId);
		}
		await loadsSvc.startCall(ev.locals.db, loadId, { by, minutes: minutes && minutes > 0 && minutes <= 120 ? minutes : undefined });
	}),
	cancelCall: loadAction('cancelCall', async (ev, loadId) => {
		await loadsSvc.cancelCall(ev.locals.db, loadId);
	}),
	board: loadAction('board', async (ev, loadId, _f, by) => {
		await loadsSvc.boardLoad(ev.locals.db, loadId, { by });
	}),
	depart: loadAction('depart', async (ev, loadId) => {
		await loadsSvc.departLoad(ev.locals.db, loadId);
	}),
	land: loadAction('land', async (ev, loadId) => {
		await loadsSvc.landLoad(ev.locals.db, loadId);
	}),
	complete: loadAction('complete', async (ev, loadId, _f, by) => {
		const before = await loadsSvc.getLoad(ev.locals.db, loadId);
		const res = await loadsSvc.completeLoad(ev.locals.db, loadId, { by });
		const summary: CompleteSummary = {
			loadNumber: before.loadNumber,
			logbookEntries: res.logbookEntries,
			charged: res.chargedSlotIds.length,
			notified: res.notified,
			staffPaid: before.slots.filter((s) => s.staffPayMinor > 0).length + (res.load.pilotPayMinor ? 1 : 0)
		};
		return { summary };
	}),
	cancel: loadAction('cancel', async (ev, loadId, _f, by) => {
		await loadsSvc.cancelLoad(ev.locals.db, loadId, { by });
	}),
	refuel: loadAction('refuel', async (ev, loadId, form) => {
		await loadsSvc.updateLoad(ev.locals.db, loadId, { refuel: bool(form, 'refuel') });
	}),
	shutdown: loadAction('shutdown', async (ev, loadId, form) => {
		const m = optNum(form, 'minutes');
		if (m != null && (!Number.isInteger(m) || m < 1 || m > 600)) throw new DomainError('invalid', 'Shutdown minutes must be 1–600');
		await loadsSvc.updateLoad(ev.locals.db, loadId, { shutdownMinutes: m });
	}),
	deleteLoad: loadAction('deleteLoad', async (ev, loadId, _f, by) => {
		await loadsSvc.deleteLoad(ev.locals.db, loadId, { by });
		return { deleted: true };
	}),

	moveSlot: async (ev: Ev) => {
		const form = await ev.request.formData();
		return runAction('moveSlot', async () => {
			const s = await slotWithCap(ev, str(form, 'slotId'), 'manifest');
			const to = await loadWithCap(ev, str(form, 'toLoadId'), 'manifest');
			await loadsSvc.moveSlot(ev.locals.db, s.id, to.id, { by: ev.locals.user!.id, withGroup: bool(form, 'withGroup') });
			return { ok: true, action: 'moveSlot', toLoadNumber: to.loadNumber };
		});
	},
	removeSlot: async (ev: Ev) => {
		const form = await ev.request.formData();
		return runAction('removeSlot', async () => {
			const s = await slotWithCap(ev, str(form, 'slotId'), 'manifest');
			const n = await loadsSvc.removeSlot(ev.locals.db, s.id, { by: ev.locals.user!.id, withGroup: bool(form, 'withGroup') });
			return { ok: true, action: 'removeSlot', removed: n };
		});
	},
	markPaid: async (ev: Ev) => {
		const form = await ev.request.formData();
		const ids = form.getAll('slotId').map(String).filter(Boolean);
		return runAction('markPaid', async () => {
			if (ids.length === 0) throw new DomainError('invalid', 'Nothing to mark as paid');
			const first = await slotWithCap(ev, ids[0], 'payments.manage');
			const provider = str(form, 'provider');
			if (!['cash', 'card', 'eft', 'manual'].includes(provider)) throw new DomainError('invalid', 'Choose how it was paid');
			const p = await markSlotsPaid(ev.locals.db, {
				dropzoneId: first.dropzoneId,
				slotIds: ids,
				provider: provider as 'cash' | 'card' | 'eft' | 'manual',
				by: ev.locals.user!.id
			});
			return { ok: true, action: 'markPaid', paid: p?.slotIds.length ?? 0 };
		});
	}
};

export const slotActions = {
	/** Members / checked-in / staff: one or many user ids with one jump type. */
	addMembers: async (ev: Ev) => {
		const form = await ev.request.formData();
		const loadId = str(form, 'loadId');
		const userIds = [...new Set(form.getAll('userId').map(String).filter(Boolean))];
		let currency = 'USD';
		return runAction(
			'addMembers',
			async () => {
				const load = await loadWithCap(ev, loadId, 'manifest');
				currency = await currencyOf(ev, load.dropzoneId);
				if (userIds.length === 0) throw new DomainError('invalid', 'Select at least one jumper');
				const jt = jumpType(form);
				const ex = extras(form);
				const role = staffRole(form);
				const opts = {
					by: ev.locals.user!.id,
					allowExpired: bool(form, 'allowExpired'),
					skipWallet: bool(form, 'skipWallet')
				};
				const weightKg = userIds.length === 1 ? positiveWeight(optNum(form, 'weightKg')) : null;
				const note = optStr(form, 'note');
				if (userIds.length > 1 && bool(form, 'asGroup')) {
					await manifestGroup(ev.locals.db, { loadId, userIds, jumpType: jt, extras: ex, teamName: optStr(form, 'teamName') }, opts);
				} else {
					await loadsSvc.addSlots(
						ev.locals.db,
						loadId,
						userIds.map((userId) => ({
							userId,
							jumpType: jt,
							extras: ex,
							staffRole: role,
							weightKg,
							note,
							isLoadMaster: userIds.length === 1 && bool(form, 'isLoadMaster')
						})),
						opts
					);
				}
				return { ok: true, action: 'addMembers', added: userIds.length };
			},
			currency
		);
	},
	addCustom: async (ev: Ev) => {
		const form = await ev.request.formData();
		const loadId = str(form, 'loadId');
		return runAction('addCustom', async () => {
			await loadWithCap(ev, loadId, 'manifest');
			const name = str(form, 'displayName');
			if (!name) throw new DomainError('invalid', 'Jumper name is required');
			const weightKg = positiveWeight(optNum(form, 'weightKg'));
			if (weightKg == null) throw new DomainError('invalid', 'Slot weight (kg) is required');
			await loadsSvc.addSlot(
				ev.locals.db,
				loadId,
				{
					displayName: name,
					email: optStr(form, 'email'),
					licence: optStr(form, 'licence'),
					weightKg,
					jumpType: jumpType(form),
					extras: extras(form),
					note: optStr(form, 'note')
				},
				{ by: ev.locals.user!.id }
			);
			return { ok: true, action: 'addCustom', added: 1 };
		});
	},
	addTandem: async (ev: Ev) => {
		const form = await ev.request.formData();
		const loadId = str(form, 'loadId');
		return runAction('addTandem', async () => {
			await loadWithCap(ev, loadId, 'manifest');
			const passengerId = str(form, 'passengerId');
			const instructorUserId = str(form, 'instructorUserId');
			if (!passengerId) throw new DomainError('invalid', 'Choose a tandem passenger');
			if (!instructorUserId) throw new DomainError('invalid', 'Choose a tandem instructor');
			const created = await loadsSvc.addTandemGroup(
				ev.locals.db,
				{ loadId, passengerId, instructorUserId, videographerUserId: optStr(form, 'videographerUserId'), note: optStr(form, 'note') },
				{ by: ev.locals.user!.id, allowExpired: bool(form, 'allowExpired') }
			);
			return { ok: true, action: 'addTandem', added: created.length };
		});
	},
	addTeam: async (ev: Ev) => {
		const form = await ev.request.formData();
		const loadId = str(form, 'loadId');
		let currency = 'USD';
		return runAction(
			'addTeam',
			async () => {
				const load = await loadWithCap(ev, loadId, 'manifest');
				currency = await currencyOf(ev, load.dropzoneId);
				const teamId = str(form, 'teamId');
				if (!teamId) throw new DomainError('invalid', 'Choose a team');
				const created = await manifestTeam(
					ev.locals.db,
					{ teamId, loadId, jumpType: jumpType(form), extras: extras(form), includeStaff: bool(form, 'includeStaff') },
					{ by: ev.locals.user!.id, allowExpired: bool(form, 'allowExpired'), skipWallet: bool(form, 'skipWallet') }
				);
				return { ok: true, action: 'addTeam', added: created.length };
			},
			currency
		);
	},
	updateSlot: async (ev: Ev) => {
		const form = await ev.request.formData();
		return runAction('updateSlot', async () => {
			const s = await slotWithCap(ev, str(form, 'slotId'), 'manifest');
			const patch: loadsSvc.SlotPatch = {};
			if (form.has('jumpType')) patch.jumpType = jumpType(form);
			if (form.has('extrasSent')) patch.extras = extras(form);
			if (form.has('weightKg') && str(form, 'weightKg') !== '') patch.weightKg = positiveWeight(optNum(form, 'weightKg')) ?? s.weightKg;
			if (form.has('baseOverride')) patch.baseOverrideMinor = optMoney(form, 'baseOverride');
			if (form.has('note')) patch.note = optStr(form, 'note');
			if (form.has('colour')) patch.colour = optStr(form, 'colour');
			if (form.has('lmSent')) patch.isLoadMaster = bool(form, 'isLoadMaster');
			if (form.has('staffRole')) patch.staffRole = staffRole(form);
			if (form.has('displayName') && !s.userId && str(form, 'displayName')) patch.displayName = str(form, 'displayName');
			// paid slots: only cosmetic fields may change
			if (s.paid) {
				if (patch.jumpType === s.jumpType) delete patch.jumpType;
				if (patch.extras && [...patch.extras].sort().join() === [...s.extras].sort().join()) delete patch.extras;
				if (patch.baseOverrideMinor === s.baseOverrideMinor) delete patch.baseOverrideMinor;
			}
			await loadsSvc.updateSlot(ev.locals.db, s.id, patch, { by: ev.locals.user!.id });
			return { ok: true, action: 'updateSlot' };
		});
	}
};
