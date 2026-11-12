import { redirect } from '@sveltejs/kit';
import { APP_ORIGIN } from '$app/env/private';
import { HEARD_FROM } from '#lib/domain/constants.ts';
import { createOnlineBooking } from '#lib/server/domain/tandems.ts';
import { listSections } from '#lib/server/domain/indemnity.ts';
import { DomainError } from '#lib/server/domain/errors.ts';
import { addDays, ageOn, isIsoDate, localDate } from '#lib/server/domain/time.ts';
import { tandemExtrasOffer, tandemLimits } from '#lib/server/tandems/detail.ts';
import { parsePassengerForm } from '#lib/server/tandems/forms.ts';
import { failFrom, publicOrigin, sendAdminBookingEmail, sendConfirmationEmail, str } from '#lib/server/tandems/http.ts';
import { bookingOptions } from '#lib/server/tandems/payments.ts';
import { startTandemCheckout, isOnlineProvider } from '#lib/server/payments/index.ts';
import { paymentsContext, secretsKey } from '#lib/server/payments/runtime.ts';
import { bookableDays, publicDropzone } from '#lib/server/tandems/public.ts';
import type { Actions, PageServerLoad } from './$types';

const HORIZON_DAYS = 90;
const MAX_JUMPERS = 5;
const MIN_AGE = 12;

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const dz = await publicDropzone(locals.db, params.slug);
	const [{ today, days }, offer, sections, pay] = await Promise.all([
		bookableDays(locals.db, dz, HORIZON_DAYS),
		tandemExtrasOffer(locals.db, dz.id),
		listSections(locals.db, dz.id, 'tandem'),
		bookingOptions(locals.db, dz, secretsKey())
	]);
	const qDate = url.searchParams.get('date');
	return {
		today,
		horizon: addDays(today, HORIZON_DAYS),
		days,
		initialDate: qDate && days[qDate] ? qDate : null,
		offer,
		limits: tandemLimits(dz),
		providers: pay.options,
		waiver: dz.indemnityTandemActive && sections.length > 0,
		heardFrom: HEARD_FROM as readonly string[],
		maxJumpers: MAX_JUMPERS,
		minAge: MIN_AGE
	};
};

/** Fields for jumper i are posted as j<i>_<field>; strip the prefix and reuse the staff parser. */
function jumperForm(f: FormData, i: number): FormData {
	const out = new FormData();
	const prefix = `j${i}_`;
	for (const [k, v] of f.entries()) if (k.startsWith(prefix)) out.append(k.slice(prefix.length), v);
	return out;
}

export const actions: Actions = {
	book: async ({ locals, params, request, url }) => {
		const dz = await publicDropzone(locals.db, params.slug);
		const f = await request.formData();
		const origin = publicOrigin(url, APP_ORIGIN);
		let landing = '';
		let redirectTo: string | null = null;
		try {
			const [date, time] = str(f, 'slot').split('|');
			if (!isIsoDate(date) || !time) throw new DomainError('invalid', 'Please choose a date and time');
			const today = localDate(Date.now(), dz.timezone);
			if (date < today) throw new DomainError('invalid', 'That date has passed — please choose another');
			const count = Math.trunc(Number(str(f, 'count')) || 1);
			if (count < 1 || count > MAX_JUMPERS) throw new DomainError('invalid', `Book between 1 and ${MAX_JUMPERS} jumpers`);
			if (f.get('terms') !== 'on') throw new DomainError('invalid', 'Please accept the booking terms');
			const pay = await bookingOptions(locals.db, dz, secretsKey());
			const providerId = str(f, 'provider') || pay.options[0]?.id || 'manual';
			if (!pay.options.some((o) => o.id === providerId)) throw new DomainError('invalid', 'Please choose how you would like to pay');
			const payFull = str(f, 'pay') === 'full';

			const limits = tandemLimits(dz);
			const lead = parsePassengerForm(jumperForm(f, 0));
			const jumpers = Array.from({ length: count }, (_, i) => {
				const j = parsePassengerForm(jumperForm(f, i));
				const who = count > 1 ? `Jumper ${i + 1}: ` : '';
				if (!j.name) throw new DomainError('invalid', `${who}please enter a full name`);
				if (!j.email) throw new DomainError('invalid', `${who}please enter an email address`);
				if (!j.phone) throw new DomainError('invalid', `${who}please enter a phone number`);
				if (!j.dob) throw new DomainError('invalid', `${who}please enter a date of birth`);
				if (ageOn(j.dob, date) < MIN_AGE) throw new DomainError('invalid', `${who}tandem passengers must be at least ${MIN_AGE} years old on the jump date`);
				if (j.weightKg == null) throw new DomainError('invalid', `${who}please enter a weight`);
				if (j.weightKg > limits.maxWeightKg) {
					throw new DomainError('invalid', `${who}the tandem weight limit is ${limits.maxWeightKg} kg — please contact us before booking`);
				}
				// Emergency contact defaults to the lead jumper's.
				j.emergencyName ??= lead.emergencyName ?? null;
				j.emergencyPhone ??= lead.emergencyPhone ?? null;
				if (!j.emergencyName || !j.emergencyPhone) throw new DomainError('invalid', `${who}please add an emergency contact`);
				j.heardFrom = lead.heardFrom ?? null;
				j.note = i === 0 ? (lead.note ?? null) : null;
				return { ...j, name: j.name, email: j.email };
			});

			const res = await createOnlineBooking(locals.db, { dropzoneId: dz.id, date, time, jumpers, depositPaid: false });
			const confs = res.passengers.map((p) => p.confirmationNumber);
			for (const p of res.passengers) await sendConfirmationEmail(dz, p, origin).catch(() => {});
			for (const p of res.passengers) await sendAdminBookingEmail(dz, p, origin).catch(() => {});
			const [first, ...rest] = confs;
			landing = `/dz/${dz.slug}/book/${first}?${new URLSearchParams({ new: '1', ...(rest.length ? { g: rest.join(',') } : {}) })}`;
			if (isOnlineProvider(providerId)) {
				// Deposit (per jumper) by default; the full price when asked or when there's no deposit.
				const depositEach = res.passengers.length ? res.depositMinor / res.passengers.length : 0;
				const deposit = !payFull && depositEach > 0;
				try {
					const { next } = await startTandemCheckout(locals.db, paymentsContext(), {
						dz,
						provider: providerId,
						origin,
						deposit,
						allocations: res.passengers.map((p) => ({ passengerId: p.id, amountMinor: deposit ? depositEach : p.totalMinor })),
						description: `${deposit ? 'Tandem skydive deposit' : 'Tandem skydive'} · ${dz.name}`,
						customer: { name: res.passengers[0].name, email: res.passengers[0].email, phone: res.passengers[0].phone },
						returnTo: landing,
						secretsKey: secretsKey()
					});
					redirectTo = next;
				} catch (e) {
					// The booking stands; the confirmation page offers "pay online" again.
					console.warn('[book] online payment could not start', e);
					landing += '&payerror=1';
				}
			}
		} catch (e) {
			return failFrom(e);
		}
		if (redirectTo) redirect(303, redirectTo, { external: [new URL(redirectTo).origin] });
		redirect(303, landing);
	}
};
