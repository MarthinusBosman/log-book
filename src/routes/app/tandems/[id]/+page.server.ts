import { error, fail } from '@sveltejs/kit';
import { APP_ORIGIN } from '$app/env/private';
import {
	cancelPassenger,
	changeTandemStaff,
	completePassenger,
	getPassenger,
	recordTandemPayment,
	resetPassenger,
	tandemGroup,
	updatePassenger
} from '#lib/server/domain/tandems.ts';
import { addTandemGroup, removeSlot } from '#lib/server/domain/loads.ts';
import { DomainError, isDomainError } from '#lib/server/domain/errors.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { dropStoredTandemPdf } from '#lib/server/tandems/documents.ts';
import { failFrom, moneyToMinor, publicOrigin, sendConfirmationEmail, staffContext, str, type StaffContext } from '#lib/server/tandems/http.ts';
import { parsePassengerForm } from '#lib/server/tandems/forms.ts';
import { passengerDetail, tandemExtrasOffer, tandemLimits } from '#lib/server/tandems/detail.ts';
import type { RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { dz } = await staffContext(event, 'tandems.manage');
	try {
		const detail = await passengerDetail(event.locals.db, dz, event.params.id);
		return {
			dz: { id: dz.id, name: dz.name, slug: dz.slug, currency: dz.currency },
			detail,
			offer: await tandemExtrasOffer(event.locals.db, dz.id),
			limits: tandemLimits(dz)
		};
	} catch (e) {
		if (isDomainError(e, 'not_found')) error(404, 'Tandem booking not found');
		throw e;
	}
};

/** Every action: staff check + the passenger must belong to the active DZ. */
async function ctx(event: RequestEvent<{ id: string }>): Promise<StaffContext & { id: string; form: FormData }> {
	const c = await staffContext(event, 'tandems.manage');
	const p = await getPassenger(event.locals.db, event.params.id);
	if (!p || p.dropzoneId !== c.dz.id) error(404, 'Tandem booking not found');
	return { ...c, id: p.id, form: await event.request.formData() };
}

export const actions: Actions = {
	update: async (event) => {
		const { id, form } = await ctx(event);
		try {
			const patch = parsePassengerForm(form);
			if ('name' in patch && !patch.name) throw new DomainError('invalid', 'Passenger name is required');
			await updatePassenger(event.locals.db, id, patch);
			return { ok: true, message: 'Tandem details saved' };
		} catch (e) {
			return failFrom(e);
		}
	},

	pay: async (event) => {
		const { id, form, userId } = await ctx(event);
		try {
			const amount = moneyToMinor(str(form, 'amount'));
			if (!amount || amount <= 0) throw new DomainError('invalid', 'Enter the amount received');
			const method = str(form, 'method');
			if (!['cash', 'card', 'eft', 'manual'].includes(method)) throw new DomainError('invalid', 'Choose a payment method');
			await recordTandemPayment(event.locals.db, {
				passengerId: id,
				amountMinor: amount,
				provider: method as 'cash' | 'card' | 'eft' | 'manual',
				isDeposit: form.get('isDeposit') === 'on',
				providerRef: str(form, 'reference') || null,
				by: userId
			});
			return { ok: true, message: 'Tandem payment has been updated' };
		} catch (e) {
			return failFrom(e);
		}
	},

	manifest: async (event) => {
		const { id, form, userId } = await ctx(event);
		try {
			const loadId = str(form, 'loadId');
			const ti = str(form, 'instructorUserId');
			if (!loadId) throw new DomainError('invalid', 'Choose a load');
			if (!ti) throw new DomainError('invalid', 'Choose a tandem instructor');
			await addTandemGroup(
				event.locals.db,
				{ loadId, passengerId: id, instructorUserId: ti, videographerUserId: str(form, 'videographerUserId') || null, note: str(form, 'note') || null },
				// staff jump free; the passenger has no account → no wallet holds involved
				{ by: userId }
			);
			return { ok: true, message: 'Tandem group added to load' };
		} catch (e) {
			if (isDomainError(e, 'load_full')) return failFrom(new DomainError('load_full', 'There are not enough slots available on this load for the tandem slots'));
			return failFrom(e);
		}
	},

	staff: async (event) => {
		const { id, form, userId } = await ctx(event);
		try {
			const role = str(form, 'role');
			if (role !== 'tandem_instructor' && role !== 'videographer') throw new DomainError('invalid', 'Unknown role');
			await changeTandemStaff(event.locals.db, { passengerId: id, role, userId: str(form, 'userId') || null, by: userId });
			return { ok: true, message: role === 'tandem_instructor' ? 'Tandem instructor changed' : 'Videographer updated' };
		} catch (e) {
			return failFrom(e);
		}
	},

	unmanifest: async (event) => {
		const { id, userId } = await ctx(event);
		try {
			const pax = (await tandemGroup(event.locals.db, id)).find((g) => !g.staffRole);
			if (!pax) throw new DomainError('conflict', 'This tandem is not on a load');
			await removeSlot(event.locals.db, pax.slotId, { by: userId, withGroup: true });
			return { ok: true, message: 'Removed from the load' };
		} catch (e) {
			return failFrom(e);
		}
	},

	cancel: async (event) => {
		const { id } = await ctx(event);
		try {
			await cancelPassenger(event.locals.db, id);
			return { ok: true, message: 'Booking cancelled' };
		} catch (e) {
			return failFrom(e);
		}
	},

	reset: async (event) => {
		const { id } = await ctx(event);
		try {
			await resetPassenger(event.locals.db, id);
			return { ok: true, message: 'Tandem reset' };
		} catch (e) {
			return failFrom(e);
		}
	},

	complete: async (event) => {
		const { id } = await ctx(event);
		try {
			await completePassenger(event.locals.db, id);
			return { ok: true, message: 'Marked as jumped' };
		} catch (e) {
			return failFrom(e);
		}
	},

	resend: async (event) => {
		const { id, dz } = await ctx(event);
		const p = (await getPassenger(event.locals.db, id))!;
		if (!p.email) return failFrom(new DomainError('invalid', 'This passenger has no email address'));
		try {
			await sendConfirmationEmail(dz, p, publicOrigin(event.url, APP_ORIGIN));
		} catch {
			return fail(502, { message: 'The email couldn’t be sent right now. Try again in a minute.' });
		}
		return { ok: true, message: `Confirmation sent to ${p.email}` };
	},

	regenerate: async (event) => {
		const { id } = await ctx(event);
		try {
			await dropStoredTandemPdf(event.locals.db, await getStorage(), id);
			return { ok: true, message: 'Tandem PDF regenerated successfully' };
		} catch (e) {
			return failFrom(e);
		}
	}
};
