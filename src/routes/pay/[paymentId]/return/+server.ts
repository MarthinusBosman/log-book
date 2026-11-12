import { error, redirect } from '@sveltejs/kit';
import { getPayment } from '#lib/server/domain/online-payments.ts';
import { landingFor, verifyOnReturn } from '#lib/server/payments/index.ts';
import { paymentsContext, secretsKey } from '#lib/server/payments/runtime.ts';
import type { RequestHandler } from './$types';

/**
 * Customer is back from the provider. The webhook normally confirmed the payment already; if not,
 * ask the provider directly (Paystack verify / Stripe session) — never trust the redirect itself.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const p = await getPayment(locals.db, params.paymentId);
	if (!p) error(404, 'Payment not found');
	const after = await verifyOnReturn(locals.db, paymentsContext(), p, secretsKey());
	redirect(303, landingFor(after, 'return'));
};
