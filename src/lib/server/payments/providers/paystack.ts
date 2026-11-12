/**
 * Paystack (South Africa, Nigeria, Ghana, Kenya…) — Initialize Transaction → hosted checkout,
 * `charge.success` webhook signed with HMAC-SHA512 of the raw body using the secret key
 * (`x-paystack-signature`), and Verify Transaction on the customer's return.
 * Docs: https://paystack.com/docs/api/transaction/ (initialize, verify, list),
 *       https://paystack.com/docs/payments/webhooks/ (signature, IPs),
 *       https://paystack.com/docs/api/refund/
 */
import { hmacHex, safeEqual } from '../crypto.ts';
import { jsonOrThrow, ProviderError, type Confirmation, type PaymentProvider, type ProviderContext } from '../types.ts';

export type PaystackCreds = { secretKey: string };

const base = (ctx: ProviderContext) => (ctx.mockUrl ? `${ctx.mockUrl}/paystack` : 'https://api.paystack.co');

function auth(creds: PaystackCreds) {
	return { authorization: `Bearer ${creds.secretKey}`, 'content-type': 'application/json' };
}

type PaystackTx = { id: number | string; status: string; reference: string; amount: number; currency: string };

function confirmation(paymentId: string, tx: PaystackTx): Confirmation | null {
	const outcome = tx.status === 'success' ? 'succeeded' : tx.status === 'failed' || tx.status === 'reversed' ? 'failed' : null;
	if (!outcome) return null;
	return { paymentId, outcome, providerTxId: String(tx.id), amountMinor: Number(tx.amount), currency: String(tx.currency).toUpperCase(), providerRef: tx.reference };
}

export function paystackSignature(secretKey: string, rawBody: string): Promise<string> {
	return hmacHex('SHA-512', secretKey, rawBody);
}

export const paystack: PaymentProvider<PaystackCreds> = {
	id: 'paystack',
	label: 'Paystack',
	blurb: 'Card, Apple Pay, EFT and more via Paystack.',
	currencies: ['ZAR', 'NGN', 'GHS', 'KES', 'USD'],

	async createCheckout(ctx, creds, input) {
		if (!input.customer.email) throw new ProviderError('Paystack needs the customer’s email address.');
		const res = await ctx.fetch(`${base(ctx)}/transaction/initialize`, {
			method: 'POST',
			headers: auth(creds),
			body: JSON.stringify({
				email: input.customer.email,
				amount: String(input.amountMinor),
				currency: input.currency.toUpperCase(),
				reference: input.paymentId,
				callback_url: input.returnUrl,
				metadata: JSON.stringify({ payment_id: input.paymentId, dropzone_id: input.dropzoneId, cancel_action: input.cancelUrl, description: input.description })
			})
		});
		const body = await jsonOrThrow<{ status: boolean; message?: string; data?: { authorization_url: string; reference: string } }>(res, 'Paystack initialize');
		if (!body.status || !body.data?.authorization_url) throw new ProviderError(`Paystack initialize failed: ${body.message ?? 'no checkout URL'}`);
		return { kind: 'redirect', url: body.data.authorization_url, providerRef: body.data.reference };
	},

	async handleWebhook(_ctx, creds, req, lookup) {
		const sig = req.headers.get('x-paystack-signature') ?? '';
		if (!sig || !safeEqual(await paystackSignature(creds.secretKey, req.rawBody), sig.toLowerCase())) {
			return { ok: false, status: 401, reason: 'Paystack: signature mismatch' };
		}
		const event = JSON.parse(req.rawBody) as { event?: string; data?: PaystackTx };
		if (event.event !== 'charge.success' || !event.data?.reference) return { ok: true, confirmations: [], note: `ignored ${event.event}` };
		const payment = await lookup.byId(event.data.reference);
		if (!payment) return { ok: true, confirmations: [], note: 'not one of ours' };
		const c = confirmation(payment.id, event.data);
		return { ok: true, confirmations: c ? [c] : [] };
	},

	async verifyPayment(ctx, creds, payment) {
		const res = await ctx.fetch(`${base(ctx)}/transaction/verify/${encodeURIComponent(payment.id)}`, { headers: auth(creds) });
		const body = await jsonOrThrow<{ status: boolean; data?: PaystackTx }>(res, 'Paystack verify');
		return body.data ? confirmation(payment.id, body.data) : null;
	},

	async testConnection(ctx, creds) {
		try {
			const res = await ctx.fetch(`${base(ctx)}/transaction?perPage=1`, { headers: auth(creds) });
			if (res.ok) return { ok: true, message: `Paystack accepted the ${creds.secretKey.startsWith('sk_test_') ? 'test' : 'live'} secret key.` };
			return { ok: false, message: res.status === 401 ? 'Paystack rejected the secret key.' : `Paystack answered ${res.status}.` };
		} catch (e) {
			return { ok: false, message: e instanceof Error ? e.message : 'Paystack unreachable' };
		}
	},

	async refund(ctx, creds, payment, amountMinor) {
		const res = await ctx.fetch(`${base(ctx)}/refund`, {
			method: 'POST',
			headers: auth(creds),
			body: JSON.stringify({ transaction: payment.providerEventId ?? payment.id, ...(amountMinor ? { amount: amountMinor } : {}) })
		});
		const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string } | null;
		return res.ok && body?.status ? { ok: true, message: body.message ?? 'Refund queued' } : { ok: false, message: `Paystack refund failed: ${body?.message ?? res.status}` };
	}
};
