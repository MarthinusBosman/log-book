/**
 * Local stand-ins for the PayFast, Paystack, Yoco and Stripe endpoints we use — for unit tests
 * (in-process `handle`) and browser e2e (`bun scripts/mock-payments.ts`, app run with
 * PAYMENTS_MOCK_URL). They mimic each provider's documented behaviour, INCLUDING signing their
 * webhooks the documented way, so the real verification code runs end to end. No real provider is
 * ever contacted and no money moves.
 *
 * Each mock checkout page has "Pay" and "Cancel" buttons. "Pay" sends the provider's notification
 * to the app (PayFast ITN → notify_url; Paystack/Stripe → the dropzone's webhook URL; Yoco → the
 * URL registered through POST /api/webhooks), then redirects back like the real thing.
 */
import { hmacBase64, hmacHex, md5, phpUrlencode, toBase64 } from './crypto.ts';
import { apiSignature, checkoutSignature } from './providers/payfast.ts';

export type MockOptions = {
	/** App origin the mock posts webhooks to (Paystack/Stripe dashboard URL equivalent). */
	appOrigin?: string;
	/** PayFast passphrase per merchant id (mock signs ITNs with it). Default: docs sandbox values. */
	payfastPassphrases?: Record<string, string>;
	/** Stripe endpoint signing secret the mock signs with (paste the same into the app). */
	stripeWebhookSecret?: string;
	/** How webhooks are delivered (default: global fetch). */
	send?: (req: Request) => Promise<Response>;
	now?: () => number;
};

export const MOCK_STRIPE_WEBHOOK_SECRET = 'whsec_mock_log_book_payments_secret';
export const MOCK_PAYFAST = { merchantId: '10000100', merchantKey: '46f0cd694581a', passphrase: 'jt7NOE43FZPn' };

type Delivery = { provider: string; url: string; status: number; body: string };

const html = (title: string, body: string) =>
	new Response(
		`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<style>body{font:16px system-ui;background:#0b1220;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#111a2e;padding:32px;border-radius:16px;max-width:420px;width:90%}
button{font:inherit;padding:12px 20px;border-radius:10px;border:0;margin:8px 8px 0 0;cursor:pointer}.pay{background:#22c55e;color:#04210f}.cancel{background:#334155;color:#e5e7eb}small{color:#94a3b8}</style></head>
<body><main>${body}</main></body></html>`,
		{ headers: { 'content-type': 'text/html; charset=utf-8' } }
	);

const json = (data: unknown, status = 200) => Response.json(data, { status });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rid = (p: string) => `${p}${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
const goodKey = (h: string | null) => !!h && /^Bearer sk_test_/.test(h) && !/^Bearer sk_test_bad/.test(h);

function checkoutPage(provider: string, amount: string, item: string, action: string) {
	return html(
		`Mock ${provider}`,
		`<p><small>MOCK ${provider.toUpperCase()} — no real money</small></p><h1 data-testid="mock-amount">${esc(amount)}</h1><p>${esc(item)}</p>
<form method="post" action="${action}/pay" style="display:inline"><button class="pay" data-testid="mock-pay">Pay now</button></form>
<form method="post" action="${action}/cancel" style="display:inline"><button class="cancel" data-testid="mock-cancel">Cancel</button></form>`
	);
}

export function createMockProviders(opts: MockOptions = {}) {
	const pass = { [MOCK_PAYFAST.merchantId]: MOCK_PAYFAST.passphrase, ...(opts.payfastPassphrases ?? {}) };
	const stripeSecret = opts.stripeWebhookSecret ?? MOCK_STRIPE_WEBHOOK_SECRET;
	const send = opts.send ?? ((r: Request) => fetch(r));
	const now = opts.now ?? Date.now;
	const deliveries: Delivery[] = [];

	const pf = { sessions: new Map<string, Record<string, string>>(), valid: new Set<string>() };
	const ps = new Map<string, { id: number; reference: string; amount: number; currency: string; email: string; callback_url: string; metadata: Record<string, string>; status: string; key: string }>();
	const yo = { hooks: new Map<string, { id: string; url: string; secret: string }[]>(), checkouts: new Map<string, { id: string; amount: number; currency: string; successUrl: string; cancelUrl: string; key: string; status: string; metadata: Record<string, unknown> }>() };
	const st = new Map<string, { id: string; amount: number; currency: string; success_url: string; cancel_url: string; client_reference_id: string; metadata: Record<string, string>; payment_status: string; status: string; payment_intent: string | null; key: string }>();

	async function deliver(provider: string, url: string, init: RequestInit) {
		try {
			const res = await send(new Request(url, { method: 'POST', ...init }));
			deliveries.push({ provider, url, status: res.status, body: await res.text() });
		} catch (e) {
			deliveries.push({ provider, url, status: 0, body: String(e) });
		}
	}
	const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

	async function handle(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const self = url.origin;
		const p = url.pathname;
		let m: RegExpMatchArray | null;

		// ── PayFast ──
		if (p === '/payfast/eng/process' && req.method === 'POST') {
			const fields = [...new URLSearchParams(await req.text())];
			const data = Object.fromEntries(fields);
			const unsigned = fields.filter(([k]) => k !== 'signature');
			const expected = checkoutSignature(unsigned, pass[data.merchant_id] ?? null);
			if (expected !== data.signature) return new Response('Generated signature does not match submitted signature.', { status: 400 });
			const id = crypto.randomUUID();
			pf.sessions.set(id, data);
			return redirect(`${self}/payfast/eng/process/${id}`);
		}
		if ((m = p.match(/^\/payfast\/eng\/process\/([\w-]+)$/)) && req.method === 'GET') {
			const s = pf.sessions.get(m[1]);
			if (!s) return new Response('not found', { status: 404 });
			return checkoutPage('PayFast', `R ${s.amount}`, s.item_name, `${self}/payfast/eng/process/${m[1]}`);
		}
		if ((m = p.match(/^\/payfast\/eng\/process\/([\w-]+)\/(pay|cancel)$/)) && req.method === 'POST') {
			const s = pf.sessions.get(m[1]);
			if (!s) return new Response('not found', { status: 404 });
			if (m[2] === 'cancel') return redirect(s.cancel_url);
			const gross = Number(s.amount);
			const fee = Math.round(gross * 3.2 + 200) / 100;
			const itn: [string, string][] = [
				['m_payment_id', s.m_payment_id ?? ''],
				['pf_payment_id', String(1000000 + Math.floor(Math.random() * 8999999))],
				['payment_status', 'COMPLETE'],
				['item_name', s.item_name ?? ''],
				['item_description', s.item_description ?? ''],
				['amount_gross', gross.toFixed(2)],
				['amount_fee', (-fee).toFixed(2)],
				['amount_net', (gross - fee).toFixed(2)],
				...[1, 2, 3, 4, 5].map((i) => [`custom_str${i}`, s[`custom_str${i}`] ?? ''] as [string, string]),
				...[1, 2, 3, 4, 5].map((i) => [`custom_int${i}`, s[`custom_int${i}`] ?? ''] as [string, string]),
				['name_first', s.name_first ?? ''],
				['name_last', s.name_last ?? ''],
				['email_address', s.email_address ?? ''],
				['merchant_id', s.merchant_id]
			];
			const paramString = itn.map(([k, v]) => `${k}=${phpUrlencode(v)}`).join('&');
			const pp = pass[s.merchant_id];
			const signature = md5(pp ? `${paramString}&passphrase=${phpUrlencode(pp)}` : paramString);
			pf.valid.add(paramString);
			if (s.notify_url) {
				await deliver('payfast', s.notify_url, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `${paramString}&signature=${signature}` });
			}
			return redirect(s.return_url ?? self);
		}
		if (p === '/payfast/eng/query/validate' && req.method === 'POST') {
			return new Response(pf.valid.has(await req.text()) ? 'VALID' : 'INVALID');
		}
		if ((p === '/payfast/api/ping' || p.startsWith('/payfast/api/refunds/')) && (req.method === 'GET' || req.method === 'POST')) {
			const h = (k: string) => req.headers.get(k) ?? '';
			const body = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
			const vars: Record<string, string> = { 'merchant-id': h('merchant-id'), version: h('version'), timestamp: h('timestamp') };
			for (const [k, v] of Object.entries(body)) vars[k] = String(v);
			const pp = pass[h('merchant-id')];
			if (!pp || apiSignature(vars, pp) !== h('signature')) return json({ code: 401, status: 'failed', data: { response: false, message: 'Signature mismatch' } }, 401);
			if (p === '/payfast/api/ping') return new Response('"API V1"');
			return json({ code: 200, status: 'success', data: { response: true, message: 'Success' } });
		}

		// ── Paystack ──
		if (p.startsWith('/paystack/') && !p.startsWith('/paystack/checkout/') && !goodKey(req.headers.get('authorization'))) {
			return json({ status: false, message: 'Invalid key' }, 401);
		}
		if (p === '/paystack/transaction/initialize' && req.method === 'POST') {
			const b = (await req.json()) as { email: string; amount: string; currency: string; reference: string; callback_url: string; metadata?: string };
			if (!b.email || !b.amount) return json({ status: false, message: 'email and amount required' }, 400);
			if (ps.has(b.reference)) return json({ status: false, message: 'Duplicate Transaction Reference' }, 400);
			const key = (req.headers.get('authorization') ?? '').slice(7);
			ps.set(b.reference, { id: Math.floor(Math.random() * 1e9), reference: b.reference, amount: Number(b.amount), currency: b.currency ?? 'ZAR', email: b.email, callback_url: b.callback_url, metadata: b.metadata ? JSON.parse(b.metadata) : {}, status: 'abandoned', key });
			return json({ status: true, message: 'Authorization URL created', data: { authorization_url: `${self}/paystack/checkout/${b.reference}`, access_code: rid('ac_'), reference: b.reference } });
		}
		if ((m = p.match(/^\/paystack\/checkout\/([\w.=-]+)$/)) && req.method === 'GET') {
			const t = ps.get(m[1]);
			if (!t) return new Response('not found', { status: 404 });
			return checkoutPage('Paystack', `${t.currency} ${(t.amount / 100).toFixed(2)}`, t.metadata.description ?? '', `${self}/paystack/checkout/${m[1]}`);
		}
		if ((m = p.match(/^\/paystack\/checkout\/([\w.=-]+)\/(pay|cancel)$/)) && req.method === 'POST') {
			const t = ps.get(m[1]);
			if (!t) return new Response('not found', { status: 404 });
			if (m[2] === 'cancel') return redirect(t.metadata.cancel_action ?? t.callback_url);
			t.status = 'success';
			const body = JSON.stringify({ event: 'charge.success', data: { id: t.id, domain: 'test', status: 'success', reference: t.reference, amount: t.amount, currency: t.currency, channel: 'card', customer: { email: t.email }, metadata: t.metadata } });
			if (opts.appOrigin && t.metadata.dropzone_id) {
				await deliver('paystack', `${opts.appOrigin}/api/payments/paystack/${t.metadata.dropzone_id}`, {
					headers: { 'content-type': 'application/json', 'x-paystack-signature': await hmacHex('SHA-512', t.key, body) },
					body
				});
			}
			return redirect(`${t.callback_url}${t.callback_url.includes('?') ? '&' : '?'}trxref=${t.reference}&reference=${t.reference}`);
		}
		if ((m = p.match(/^\/paystack\/transaction\/verify\/([\w.=-]+)$/))) {
			const t = ps.get(m[1]);
			if (!t) return json({ status: false, message: 'Transaction reference not found' }, 400);
			return json({ status: true, message: 'Verification successful', data: { id: t.id, status: t.status, reference: t.reference, amount: t.amount, currency: t.currency } });
		}
		if (p === '/paystack/transaction') return json({ status: true, message: 'Transactions retrieved', data: [] });
		if (p === '/paystack/refund' && req.method === 'POST') return json({ status: true, message: 'Refund has been queued for processing', data: {} });

		// ── Yoco ──
		if (p.startsWith('/yoco/api/') && !goodKey(req.headers.get('authorization'))) return json({ message: 'Unauthorized' }, 403);
		const yKey = (req.headers.get('authorization') ?? '').slice(7);
		if (p === '/yoco/api/webhooks' && req.method === 'GET') return json({ subscriptions: (yo.hooks.get(yKey) ?? []).map(({ id, url }) => ({ id, url, name: 'log-book-payments', mode: 'test' })) });
		if (p === '/yoco/api/webhooks' && req.method === 'POST') {
			const b = (await req.json()) as { name: string; url: string };
			const hook = { id: rid('sub_'), url: b.url, secret: `whsec_${toBase64(crypto.getRandomValues(new Uint8Array(24)))}` };
			yo.hooks.set(yKey, [...(yo.hooks.get(yKey) ?? []), hook]);
			return json({ id: hook.id, name: b.name, url: b.url, mode: 'test', events: ['payment.succeeded'], secret: hook.secret }, 201);
		}
		if (p === '/yoco/api/checkouts' && req.method === 'POST') {
			const b = (await req.json()) as { amount: number; currency: string; successUrl: string; cancelUrl: string; metadata?: Record<string, unknown> };
			if (!Number.isInteger(b.amount) || b.amount < 200) return json({ message: 'Amount must be at least 200 cents' }, 400);
			const c = { id: rid('ch_'), amount: b.amount, currency: b.currency, successUrl: b.successUrl, cancelUrl: b.cancelUrl, key: yKey, status: 'created', metadata: b.metadata ?? {} };
			yo.checkouts.set(c.id, c);
			return json({ id: c.id, status: 'created', amount: c.amount, currency: c.currency, redirectUrl: `${self}/yoco/checkout/${c.id}`, processingMode: 'test', metadata: c.metadata });
		}
		if ((m = p.match(/^\/yoco\/checkout\/(\w+)$/)) && req.method === 'GET') {
			const c = yo.checkouts.get(m[1]);
			if (!c) return new Response('not found', { status: 404 });
			return checkoutPage('Yoco', `R ${(c.amount / 100).toFixed(2)}`, String(c.metadata.description ?? ''), `${self}/yoco/checkout/${m[1]}`);
		}
		if ((m = p.match(/^\/yoco\/checkout\/(\w+)\/(pay|cancel)$/)) && req.method === 'POST') {
			const c = yo.checkouts.get(m[1]);
			if (!c) return new Response('not found', { status: 404 });
			if (m[2] === 'cancel') return redirect(c.cancelUrl);
			c.status = 'completed';
			const body = JSON.stringify({ createdDate: new Date(now()).toISOString(), id: rid('evt_'), type: 'payment.succeeded', payload: { id: rid('p_'), amount: c.amount, currency: c.currency, mode: 'test', status: 'succeeded', type: 'payment', metadata: { checkoutId: c.id } } });
			for (const hook of yo.hooks.get(c.key) ?? []) {
				const wid = rid('msg_');
				const ts = String(Math.floor(now() / 1000));
				const sig = await hmacBase64('SHA-256', Uint8Array.from(atob(hook.secret.slice(6)), (x) => x.charCodeAt(0)), `${wid}.${ts}.${body}`);
				await deliver('yoco', hook.url, { headers: { 'content-type': 'application/json', 'webhook-id': wid, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` }, body });
			}
			return redirect(c.successUrl);
		}
		if ((m = p.match(/^\/yoco\/api\/checkouts\/(\w+)\/refund$/)) && req.method === 'POST') return json({ id: m[1], refundId: rid('rfd_'), message: 'Your refund has been processed', status: 'succeeded' });

		// ── Stripe ──
		if (p.startsWith('/stripe/v1/') && !goodKey(req.headers.get('authorization'))) return json({ error: { message: 'Invalid API Key provided' } }, 401);
		const sKey = (req.headers.get('authorization') ?? '').slice(7);
		if (p === '/stripe/v1/balance') return json({ object: 'balance', available: [], livemode: false });
		if (p === '/stripe/v1/checkout/sessions' && req.method === 'POST') {
			const f = new URLSearchParams(await req.text());
			const metadata: Record<string, string> = {};
			for (const [k, v] of f) if ((m = k.match(/^metadata\[(\w+)\]$/))) metadata[m[1]] = v;
			const s = {
				id: rid('cs_test_'),
				amount: Number(f.get('line_items[0][price_data][unit_amount]')),
				currency: f.get('line_items[0][price_data][currency]') ?? 'usd',
				success_url: f.get('success_url') ?? '',
				cancel_url: f.get('cancel_url') ?? '',
				client_reference_id: f.get('client_reference_id') ?? '',
				metadata,
				payment_status: 'unpaid',
				status: 'open',
				payment_intent: null as string | null,
				key: sKey,
				name: f.get('line_items[0][price_data][product_data][name]') ?? ''
			};
			if (f.get('mode') !== 'payment' || !s.amount) return json({ error: { message: 'Missing required param' } }, 400);
			st.set(s.id, s);
			return json({ id: s.id, object: 'checkout.session', url: `${self}/stripe/checkout/${s.id}`, payment_status: 'unpaid', status: 'open' });
		}
		if ((m = p.match(/^\/stripe\/v1\/checkout\/sessions\/(\w+)$/)) && req.method === 'GET') {
			const s = st.get(m[1]);
			if (!s) return json({ error: { message: 'No such checkout.session' } }, 404);
			return json({ id: s.id, object: 'checkout.session', client_reference_id: s.client_reference_id, payment_status: s.payment_status, status: s.status, amount_total: s.amount, currency: s.currency, payment_intent: s.payment_intent, metadata: s.metadata });
		}
		if ((m = p.match(/^\/stripe\/checkout\/(\w+)$/)) && req.method === 'GET') {
			const s = st.get(m[1]);
			if (!s) return new Response('not found', { status: 404 });
			return checkoutPage('Stripe', `${s.currency.toUpperCase()} ${(s.amount / 100).toFixed(2)}`, (s as { name?: string }).name ?? '', `${self}/stripe/checkout/${m[1]}`);
		}
		if ((m = p.match(/^\/stripe\/checkout\/(\w+)\/(pay|cancel)$/)) && req.method === 'POST') {
			const s = st.get(m[1]);
			if (!s) return new Response('not found', { status: 404 });
			if (m[2] === 'cancel') return redirect(s.cancel_url);
			s.payment_status = 'paid';
			s.status = 'complete';
			s.payment_intent = rid('pi_');
			const body = JSON.stringify({
				id: rid('evt_'),
				object: 'event',
				type: 'checkout.session.completed',
				data: { object: { id: s.id, object: 'checkout.session', client_reference_id: s.client_reference_id, payment_status: 'paid', status: 'complete', amount_total: s.amount, currency: s.currency, payment_intent: s.payment_intent, metadata: s.metadata } }
			});
			if (opts.appOrigin && s.metadata.dropzone_id) {
				const t = String(Math.floor(now() / 1000));
				await deliver('stripe', `${opts.appOrigin}/api/payments/stripe/${s.metadata.dropzone_id}`, {
					headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${await hmacHex('SHA-256', stripeSecret, `${t}.${body}`)},v0=deadbeef` },
					body
				});
			}
			return redirect(s.success_url);
		}
		if (p === '/stripe/v1/refunds' && req.method === 'POST') return json({ id: rid('re_'), object: 'refund', status: 'succeeded' });

		return new Response(`mock: no route for ${req.method} ${p}`, { status: 404 });
	}

	return { handle, deliveries, state: { pf, ps, yo, st } };
}

export type MockProviders = ReturnType<typeof createMockProviders>;
