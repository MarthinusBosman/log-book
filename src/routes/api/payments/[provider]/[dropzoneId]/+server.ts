import { handleProviderWebhook } from '#lib/server/payments/index.ts';
import { paymentsContext, secretsKey } from '#lib/server/payments/runtime.ts';
import type { RequestHandler } from './$types';

/**
 * Provider notifications for one dropzone's own merchant account:
 *   POST /api/payments/payfast/<dropzoneId>   (PayFast ITN, form-encoded)
 *   POST /api/payments/paystack/<dropzoneId>  (x-paystack-signature)
 *   POST /api/payments/yoco/<dropzoneId>      (webhook-signature)
 *   POST /api/payments/stripe/<dropzoneId>    (Stripe-Signature)
 * Every request is verified against that dropzone's stored secret before anything is applied.
 * Exempt from the CSRF origin check (see src/lib/server/csrf.ts).
 */
export const POST: RequestHandler = async (event) => {
	const rawBody = await event.request.text();
	let clientIp: string | null = null;
	try {
		clientIp = event.getClientAddress();
	} catch {
		/* not available on this platform */
	}
	const r = await handleProviderWebhook(event.locals.db, paymentsContext(), {
		provider: event.params.provider,
		dropzoneId: event.params.dropzoneId,
		rawBody,
		headers: event.request.headers,
		clientIp,
		secretsKey: secretsKey()
	});
	return new Response(r.body, { status: r.status, headers: { 'content-type': 'text/plain' } });
};
