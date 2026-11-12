/**
 * Yoco (South Africa) — Checkout API: POST /api/checkouts → redirectUrl; webhooks registered via
 * POST /api/webhooks (the response carries the signing secret, shown only once) and signed
 * Standard-Webhooks style: base64 HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${body}`
 * keyed with the base64-decoded part of `whsec_…`.
 * Docs: https://developer.yoco.com/guides/online-payments/accepting-a-payment,
 *       https://developer.yoco.com/guides/online-payments/webhooks/verifying-the-events,
 *       https://developer.yoco.com/api-reference/checkout-api/checkout/create-checkout,
 *       https://developer.yoco.com/api-reference/checkout-api/webhooks/register-webhook
 */
import { fromBase64, hmacBase64, safeEqual } from '../crypto.ts';
import { jsonOrThrow, ProviderError, type PaymentProvider, type ProviderContext } from '../types.ts';

export type YocoCreds = { secretKey: string; webhookSecret: string | null; webhookId: string | null };

/** Yoco recommends rejecting events signed more than 3 minutes ago. */
export const YOCO_TOLERANCE_S = 180;

const base = (ctx: ProviderContext) => (ctx.mockUrl ? `${ctx.mockUrl}/yoco/api` : 'https://payments.yoco.com/api');
const auth = (creds: YocoCreds) => ({ authorization: `Bearer ${creds.secretKey}`, 'content-type': 'application/json' });

export async function yocoSignature(secret: string, id: string, timestamp: string, body: string): Promise<string> {
	const key = fromBase64(secret.startsWith('whsec_') ? secret.slice(6) : secret);
	if (!key) throw new ProviderError('Yoco webhook secret is not valid base64');
	return hmacBase64('SHA-256', key, `${id}.${timestamp}.${body}`);
}

export const yoco: PaymentProvider<YocoCreds> = {
	id: 'yoco',
	label: 'Yoco',
	blurb: 'Card, Apple Pay and Google Pay via Yoco.',
	currencies: ['ZAR'],

	async createCheckout(ctx, creds, input) {
		if (input.currency.toUpperCase() !== 'ZAR') throw new ProviderError('Yoco only takes payments in ZAR.');
		if (input.amountMinor < 200) throw new ProviderError('Yoco payments must be at least R2.00.');
		const res = await ctx.fetch(`${base(ctx)}/checkouts`, {
			method: 'POST',
			headers: { ...auth(creds), 'Idempotency-Key': input.paymentId },
			body: JSON.stringify({
				amount: input.amountMinor,
				currency: 'ZAR',
				successUrl: input.returnUrl,
				cancelUrl: input.cancelUrl,
				failureUrl: input.cancelUrl,
				clientReferenceId: input.paymentId,
				externalId: input.paymentId,
				metadata: { paymentId: input.paymentId, dropzoneId: input.dropzoneId, description: input.description }
			})
		});
		const body = await jsonOrThrow<{ id: string; redirectUrl: string }>(res, 'Yoco checkout');
		if (!body.redirectUrl) throw new ProviderError('Yoco returned no checkout URL');
		return { kind: 'redirect', url: body.redirectUrl, providerRef: body.id };
	},

	async handleWebhook(ctx, creds, req, lookup) {
		if (!creds.webhookSecret) return { ok: false, status: 503, reason: 'Yoco: webhook not registered for this dropzone' };
		const id = req.headers.get('webhook-id') ?? '';
		const ts = req.headers.get('webhook-timestamp') ?? '';
		const header = req.headers.get('webhook-signature') ?? '';
		const now = Math.floor((ctx.now?.() ?? Date.now()) / 1000);
		if (!id || !/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > YOCO_TOLERANCE_S) return { ok: false, status: 400, reason: 'Yoco: missing or stale timestamp' };
		const expected = await yocoSignature(creds.webhookSecret, id, ts, req.rawBody);
		const sigs = header.split(' ').map((s) => s.split(',')[1] ?? '');
		if (!sigs.some((s) => safeEqual(s, expected))) return { ok: false, status: 401, reason: 'Yoco: signature mismatch' };

		const event = JSON.parse(req.rawBody) as {
			id?: string;
			type?: string;
			payload?: { id?: string; amount?: number; currency?: string; status?: string; metadata?: { checkoutId?: string } };
		};
		const outcome = event.type === 'payment.succeeded' ? 'succeeded' : event.type === 'payment.failed' ? 'failed' : null;
		const checkoutId = event.payload?.metadata?.checkoutId;
		if (!outcome || !checkoutId) return { ok: true, confirmations: [], note: `ignored ${event.type}` };
		// Docs: filter events by checkoutId — the webhook sees every payment on the merchant account.
		const payment = await lookup.byProviderRef(checkoutId);
		if (!payment) return { ok: true, confirmations: [], note: 'not one of ours' };
		return {
			ok: true,
			confirmations: [
				{
					paymentId: payment.id,
					outcome,
					providerTxId: event.payload?.id ?? event.id ?? checkoutId,
					amountMinor: Number(event.payload?.amount),
					currency: String(event.payload?.currency ?? '').toUpperCase(),
					providerRef: checkoutId
				}
			]
		};
	},

	async testConnection(ctx, creds) {
		try {
			const res = await ctx.fetch(`${base(ctx)}/webhooks`, { headers: auth(creds) });
			if (!res.ok) return { ok: false, message: res.status === 401 || res.status === 403 ? 'Yoco rejected the secret key.' : `Yoco answered ${res.status}.` };
			const mode = creds.secretKey.startsWith('sk_test_') ? 'test' : 'live';
			return { ok: true, message: `Yoco accepted the ${mode} secret key${creds.webhookId ? '' : ' — now register the webhook'}.` };
		} catch (e) {
			return { ok: false, message: e instanceof Error ? e.message : 'Yoco unreachable' };
		}
	},

	async registerWebhook(ctx, creds, url) {
		const res = await ctx.fetch(`${base(ctx)}/webhooks`, {
			method: 'POST',
			headers: auth(creds),
			body: JSON.stringify({ name: 'log-book-payments', url, events: ['payment.succeeded'] })
		});
		const body = await jsonOrThrow<{ id: string; secret: string }>(res, 'Yoco webhook registration');
		if (!body.secret) throw new ProviderError('Yoco returned no webhook secret');
		return { id: body.id, secret: body.secret };
	},

	async refund(ctx, creds, payment, amountMinor) {
		if (!payment.providerRef) return { ok: false, message: 'No Yoco checkout id on this payment.' };
		const res = await ctx.fetch(`${base(ctx)}/checkouts/${encodeURIComponent(payment.providerRef)}/refund`, {
			method: 'POST',
			headers: { ...auth(creds), 'Idempotency-Key': `refund-${payment.id}-${amountMinor ?? 'full'}` },
			body: JSON.stringify(amountMinor ? { amount: amountMinor } : {})
		});
		const body = (await res.json().catch(() => null)) as { refundId?: string; message?: string; status?: string } | null;
		return res.ok ? { ok: true, message: body?.message ?? 'Refund processed', refundId: body?.refundId } : { ok: false, message: `Yoco refund failed: ${body?.message ?? res.status}` };
	}
};
