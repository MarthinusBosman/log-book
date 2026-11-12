import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { dropzones } from '#lib/server/db/schema.ts';
import { getPayment, meta } from '#lib/server/domain/online-payments.ts';
import { landingFor } from '#lib/server/payments/index.ts';
import type { PageServerLoad } from './$types';

/**
 * Hand-off page for form-post providers (PayFast): renders the signed form stored on the payment
 * and auto-submits it (a visible button works without JS). The payment id is the access token.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const p = await getPayment(locals.db, params.paymentId);
	if (!p) error(404, 'Payment not found');
	if (p.status !== 'pending') redirect(303, landingFor(p, 'return'));
	const form = meta(p).form;
	if (!form) error(404, 'Nothing to pay here');
	const dz = (await locals.db.select({ name: dropzones.name }).from(dropzones).where(eq(dropzones.id, p.dropzoneId)).limit(1))[0];
	return {
		dzName: dz?.name ?? '',
		provider: p.provider,
		amountMinor: p.amountMinor,
		currency: p.currency,
		action: form.action,
		fields: form.fields,
		cancelHref: `/pay/${p.id}/cancel`
	};
};
