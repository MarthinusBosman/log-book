import { error, redirect } from '@sveltejs/kit';
import { cancelPendingOnlinePayment, getPayment } from '#lib/server/domain/online-payments.ts';
import { landingFor } from '#lib/server/payments/index.ts';
import type { RequestHandler } from './$types';

/** Customer cancelled on the provider's page. (A later genuine success webhook still applies.) */
export const GET: RequestHandler = async ({ locals, params }) => {
	const p = await getPayment(locals.db, params.paymentId);
	if (!p) error(404, 'Payment not found');
	const after = (await cancelPendingOnlinePayment(locals.db, p.id)) ?? p;
	redirect(303, landingFor(after, 'cancel'));
};
