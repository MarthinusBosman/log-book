/**
 * Stripe — the dropzone's OWN Stripe account (no Connect, no platform fee): Checkout Session via the
 * form-encoded REST API, `Stripe-Signature` webhook verification (HMAC-SHA256 over `${t}.${body}`,
 * 5-minute tolerance, any `v1` may match), and session retrieval on the customer's return.
 * Docs: https://docs.stripe.com/api/checkout/sessions/create,
 *       https://docs.stripe.com/webhooks#verify-manually,
 *       https://docs.stripe.com/api/refunds/create
 * Note: Stripe doesn't onboard South African businesses directly (it points them to Paystack):
 * https://stripe.com/global — this is for dropzones outside SA.
 */
import { hmacHex, safeEqual } from '../crypto.ts';
import { jsonOrThrow, ProviderError, type Confirmation, type PaymentProvider, type ProviderContext } from '../types.ts';

export type StripeCreds = { secretKey: string; webhookSecret: string | null };

export const STRIPE_TOLERANCE_S = 300;

const base = (ctx: ProviderContext) => (ctx.mockUrl ? `${ctx.mockUrl}/stripe` : 'https://api.stripe.com');
const auth = (creds: StripeCreds) => ({ authorization: `Bearer ${creds.secretKey}` });

export function stripeSignature(secret: string, timestamp: string, body: string): Promise<string> {
	return hmacHex('SHA-256', secret, `${timestamp}.${body}`);
}

/** Parse `t=…,v1=…,v1=…,v0=…` (unknown entries ignored). */
export function parseStripeHeader(h: string): { t: string | null; v1: string[] } {
	let t: string | null = null;
	const v1: string[] = [];
	for (const part of h.split(',')) {
		const i = part.indexOf('=');
		if (i < 0) continue;
		const k = part.slice(0, i).trim();
		const v = part.slice(i + 1).trim();
		if (k === 't') t = v;
		else if (k === 'v1') v1.push(v);
	}
	return { t, v1 };
}

type Session = {
	id: string;
	object?: string;
	client_reference_id?: string | null;
	payment_status?: string;
	status?: string;
	amount_total?: number | null;
	currency?: string | null;
	payment_intent?: string | { id: string } | null;
	metadata?: Record<string, string>;
};

function fromSession(paymentId: string, s: Session, eventType?: string): Confirmation | null {
	const pi = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null);
	let outcome: Confirmation['outcome'] | null = null;
	if (eventType === 'checkout.session.async_payment_failed') outcome = 'failed';
	else if (eventType === 'checkout.session.expired' || s.status === 'expired') outcome = 'cancelled';
	else if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') outcome = 'succeeded';
	if (!outcome) return null;
	return { paymentId, outcome, providerTxId: pi ?? s.id, amountMinor: Number(s.amount_total ?? NaN), currency: String(s.currency ?? '').toUpperCase(), providerRef: s.id };
}

export const stripe: PaymentProvider<StripeCreds> = {
	id: 'stripe',
	label: 'Stripe',
	blurb: 'Card, Apple Pay and Google Pay via Stripe.',
	currencies: null,

	async createCheckout(ctx, creds, input) {
		const f = new URLSearchParams();
		f.set('mode', 'payment');
		f.set('line_items[0][quantity]', '1');
		f.set('line_items[0][price_data][currency]', input.currency.toLowerCase());
		f.set('line_items[0][price_data][unit_amount]', String(input.amountMinor));
		f.set('line_items[0][price_data][product_data][name]', input.description.slice(0, 250));
		f.set('success_url', input.returnUrl);
		f.set('cancel_url', input.cancelUrl);
		f.set('client_reference_id', input.paymentId);
		if (input.customer.email) f.set('customer_email', input.customer.email);
		f.set('metadata[payment_id]', input.paymentId);
		f.set('metadata[dropzone_id]', input.dropzoneId);
		f.set('payment_intent_data[metadata][payment_id]', input.paymentId);
		const res = await ctx.fetch(`${base(ctx)}/v1/checkout/sessions`, {
			method: 'POST',
			headers: { ...auth(creds), 'content-type': 'application/x-www-form-urlencoded', 'Idempotency-Key': input.paymentId },
			body: f.toString()
		});
		const s = await jsonOrThrow<{ id: string; url: string }>(res, 'Stripe checkout');
		if (!s.url) throw new ProviderError('Stripe returned no checkout URL');
		return { kind: 'redirect', url: s.url, providerRef: s.id };
	},

	async handleWebhook(ctx, creds, req, lookup) {
		if (!creds.webhookSecret) return { ok: false, status: 503, reason: 'Stripe: no webhook signing secret saved' };
		const { t, v1 } = parseStripeHeader(req.headers.get('stripe-signature') ?? '');
		const now = Math.floor((ctx.now?.() ?? Date.now()) / 1000);
		if (!t || !/^\d+$/.test(t) || Math.abs(now - Number(t)) > STRIPE_TOLERANCE_S) return { ok: false, status: 400, reason: 'Stripe: missing or stale timestamp' };
		const expected = await stripeSignature(creds.webhookSecret, t, req.rawBody);
		if (!v1.some((s) => safeEqual(s, expected))) return { ok: false, status: 400, reason: 'Stripe: signature mismatch' };

		const event = JSON.parse(req.rawBody) as { id: string; type: string; data?: { object?: Session } };
		if (!event.type?.startsWith('checkout.session.') || !event.data?.object) return { ok: true, confirmations: [], note: `ignored ${event.type}` };
		const s = event.data.object;
		const ref = s.client_reference_id ?? s.metadata?.payment_id;
		const payment = ref ? await lookup.byId(ref) : await lookup.byProviderRef(s.id);
		if (!payment) return { ok: true, confirmations: [], note: 'not one of ours' };
		const c = fromSession(payment.id, s, event.type);
		return { ok: true, confirmations: c ? [c] : [] };
	},

	async verifyPayment(ctx, creds, payment) {
		if (!payment.providerRef) return null;
		const res = await ctx.fetch(`${base(ctx)}/v1/checkout/sessions/${encodeURIComponent(payment.providerRef)}`, { headers: auth(creds) });
		const s = await jsonOrThrow<Session>(res, 'Stripe session lookup');
		return fromSession(payment.id, s);
	},

	async testConnection(ctx, creds) {
		try {
			const res = await ctx.fetch(`${base(ctx)}/v1/balance`, { headers: auth(creds) });
			if (res.ok) return { ok: true, message: `Stripe accepted the ${creds.secretKey.startsWith('sk_test_') || creds.secretKey.startsWith('rk_test_') ? 'test' : 'live'} key.` };
			return { ok: false, message: res.status === 401 ? 'Stripe rejected the secret key.' : `Stripe answered ${res.status}.` };
		} catch (e) {
			return { ok: false, message: e instanceof Error ? e.message : 'Stripe unreachable' };
		}
	},

	async refund(ctx, creds, payment, amountMinor) {
		const pi = payment.providerEventId;
		if (!pi?.startsWith('pi_')) return { ok: false, message: 'No Stripe payment intent on this payment.' };
		const f = new URLSearchParams({ payment_intent: pi });
		if (amountMinor) f.set('amount', String(amountMinor));
		const res = await ctx.fetch(`${base(ctx)}/v1/refunds`, {
			method: 'POST',
			headers: { ...auth(creds), 'content-type': 'application/x-www-form-urlencoded' },
			body: f.toString()
		});
		const body = (await res.json().catch(() => null)) as { id?: string; status?: string; error?: { message?: string } } | null;
		return res.ok ? { ok: true, message: `Refund ${body?.status ?? 'created'}`, refundId: body?.id } : { ok: false, message: `Stripe refund failed: ${body?.error?.message ?? res.status}` };
	}
};
