import { describe, expect, test } from 'bun:test';
import { fromBase64, hmacBase64, hmacHex, md5, phpUrlencode, safeEqual } from './crypto.ts';
import { apiSignature, checkoutSignature, ipInRanges, isPrivateIp, itnParamString, itnSignature, payfast } from './providers/payfast.ts';
import { paystackSignature } from './providers/paystack.ts';
import { parseStripeHeader, stripeSignature, stripe } from './providers/stripe.ts';
import { yocoSignature, yoco } from './providers/yoco.ts';
import { fromDecimal, toDecimal } from './types.ts';

describe('crypto primitives', () => {
	test('md5 matches RFC 1321 test suite', () => {
		expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
		expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
		expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
		expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
		expect(md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890')).toBe('57edf4a22be3c955ac49da2e2107b67a');
		// multi-byte UTF-8
		expect(md5('·')).toBe(new Bun.CryptoHasher('md5').update('·').digest('hex'));
	});

	test('HMAC matches RFC 4231 test case 2', async () => {
		const msg = 'what do ya want for nothing?';
		expect(await hmacHex('SHA-256', 'Jefe', msg)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
		expect(await hmacHex('SHA-512', 'Jefe', msg)).toBe(
			'164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737'
		);
		expect(await hmacBase64('SHA-256', 'Jefe', msg)).toBe('W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=');
	});

	test('phpUrlencode = PHP urlencode()', () => {
		expect(phpUrlencode("Skydive O'Brien (test) ~ *!")).toBe('Skydive+O%27Brien+%28test%29+%7E+%2A%21');
		expect(phpUrlencode('https://example.com/return?x=1&y=2')).toBe('https%3A%2F%2Fexample.com%2Freturn%3Fx%3D1%26y%3D2');
		expect(phpUrlencode('a-b_c.d')).toBe('a-b_c.d');
	});

	test('safeEqual / base64 / decimals', () => {
		expect(safeEqual('abc', 'abc')).toBe(true);
		expect(safeEqual('abc', 'abd')).toBe(false);
		expect(safeEqual('abc', 'ab')).toBe(false);
		expect(fromBase64('!!!')).toBeNull();
		expect(toDecimal(12345)).toBe('123.45');
		expect(fromDecimal('123.45')).toBe(12345);
		expect(fromDecimal('200')).toBe(20000);
		expect(Number.isNaN(fromDecimal('1e3'))).toBe(true);
	});
});

describe('PayFast', () => {
	const creds = { merchantId: '10000100', merchantKey: '46f0cd694581a', passphrase: 'jt7NOE43FZPn', sandbox: true };
	const ctx = { fetch: (() => Promise.reject(new Error('no network'))) as unknown as typeof fetch };

	test('checkout form: documented field order, blanks dropped, signature with passphrase', async () => {
		const input = {
			paymentId: 'pay-1',
			dropzoneId: 'dz-1',
			amountMinor: 50000,
			currency: 'ZAR',
			description: 'Tandem deposit',
			customer: { name: 'Jo', email: '' },
			returnUrl: 'https://dz.example/pay/pay-1/return',
			cancelUrl: 'https://dz.example/pay/pay-1/cancel',
			notifyUrl: 'https://dz.example/api/payments/payfast/dz-1'
		};
		const r = await payfast.createCheckout(ctx, creds, input);
		if (r.kind !== 'form') throw new Error('expected form');
		expect(r.action).toBe('https://sandbox.payfast.co.za/eng/process');
		expect(r.fields.map(([k]) => k)).toEqual(['merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url', 'name_first', 'm_payment_id', 'amount', 'item_name', 'custom_str1', 'signature']);
		const sig = r.fields.at(-1)![1];
		const str =
			'merchant_id=10000100&merchant_key=46f0cd694581a&return_url=https%3A%2F%2Fdz.example%2Fpay%2Fpay-1%2Freturn&cancel_url=https%3A%2F%2Fdz.example%2Fpay%2Fpay-1%2Fcancel' +
			'&notify_url=https%3A%2F%2Fdz.example%2Fapi%2Fpayments%2Fpayfast%2Fdz-1&name_first=Jo&m_payment_id=pay-1&amount=500.00&item_name=Tandem+deposit&custom_str1=dz-1&passphrase=jt7NOE43FZPn';
		expect(sig).toBe(md5(str));
		expect(checkoutSignature(r.fields.slice(0, -1), creds.passphrase)).toBe(sig);
		await expect(payfast.createCheckout(ctx, creds, { ...input, currency: 'USD' })).rejects.toThrow(/ZAR/);
	});

	test('ITN param string keeps posted order and blanks, stops at signature', () => {
		const body = 'm_payment_id=SuperUnique1&pf_payment_id=1089250&payment_status=COMPLETE&item_name=test+product&item_description=&amount_gross=200.00&merchant_id=10012577&signature=abc';
		const { paramString, data, signature } = itnParamString(body);
		expect(paramString).toBe('m_payment_id=SuperUnique1&pf_payment_id=1089250&payment_status=COMPLETE&item_name=test+product&item_description=&amount_gross=200.00&merchant_id=10012577');
		expect(data.item_name).toBe('test product');
		expect(signature).toBe('abc');
		expect(itnSignature(paramString, null)).toBe(md5(paramString));
		expect(itnSignature(paramString, 'salt pass')).toBe(md5(`${paramString}&passphrase=salt+pass`));
	});

	test('API signature: alphabetical incl. passphrase', () => {
		const vars = { 'merchant-id': '10000100', version: 'v1', timestamp: '2026-11-12T10:00:00+00:00' };
		expect(apiSignature(vars, 'jt7NOE43FZPn')).toBe(md5('merchant-id=10000100&passphrase=jt7NOE43FZPn&timestamp=2026-11-12T10%3A00%3A00%2B00%3A00&version=v1'));
	});

	test('source IP ranges from the docs', () => {
		expect(ipInRanges('197.97.145.150')).toBe(true);
		expect(ipInRanges('41.74.179.223')).toBe(true);
		expect(ipInRanges('102.216.36.130')).toBe(true);
		expect(ipInRanges('144.126.193.139')).toBe(true);
		expect(ipInRanges('197.97.145.160')).toBe(false);
		expect(ipInRanges('8.8.8.8')).toBe(false);
		expect(isPrivateIp('127.0.0.1')).toBe(true);
		expect(isPrivateIp('::1')).toBe(true);
		expect(isPrivateIp('10.1.2.3')).toBe(true);
		expect(isPrivateIp('8.8.8.8')).toBe(false);
	});
});

describe('webhook signatures', () => {
	test('Paystack: HMAC-SHA512 hex of the raw body with the secret key', async () => {
		const body = '{"event":"charge.success","data":{"reference":"x"}}';
		expect(await paystackSignature('sk_test_abc', body)).toBe(await hmacHex('SHA-512', 'sk_test_abc', body));
	});

	test('Yoco: rejects stale timestamps and wrong signatures, accepts any listed v1', async () => {
		const secret = `whsec_${btoa('0123456789abcdef0123456789abcdef')}`;
		const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded', payload: { id: 'p_1', amount: 50000, currency: 'ZAR', metadata: { checkoutId: 'ch_1' } } });
		const now = 1_800_000_000_000;
		const ts = String(now / 1000);
		const sig = await yocoSignature(secret, 'msg_1', ts, body);
		const pay = { id: 'pay-1', amountMinor: 50000 } as never;
		const lookup = { byId: async () => undefined, byProviderRef: async (r: string) => (r === 'ch_1' ? pay : undefined) };
		const ctx = { fetch, now: () => now };
		const creds = { secretKey: 'sk_test_x', webhookSecret: secret, webhookId: 'sub_1' };
		const h = (sigHeader: string, t = ts) => new Headers({ 'webhook-id': 'msg_1', 'webhook-timestamp': t, 'webhook-signature': sigHeader });
		const ok = await yoco.handleWebhook(ctx, creds, { rawBody: body, headers: h(`v1,bm9wZQ== v1,${sig}`), clientIp: null }, lookup);
		expect(ok).toEqual({ ok: true, confirmations: [{ paymentId: 'pay-1', outcome: 'succeeded', providerTxId: 'p_1', amountMinor: 50000, currency: 'ZAR', providerRef: 'ch_1' }] });
		const bad = await yoco.handleWebhook(ctx, creds, { rawBody: body.replace('50000', '5'), headers: h(`v1,${sig}`), clientIp: null }, lookup);
		expect(bad.ok).toBe(false);
		const stale = await yoco.handleWebhook(ctx, creds, { rawBody: body, headers: h(`v1,${sig}`, String(now / 1000 - 600)), clientIp: null }, lookup);
		expect(stale.ok).toBe(false);
	});

	test('Stripe: header parsing, tolerance, v1 only', async () => {
		expect(parseStripeHeader('t=1,v1=a,v1=b,v0=c,secret=whsec_x,payload=ab')).toEqual({ t: '1', v1: ['a', 'b'] });
		const secret = 'whsec_test_secret';
		const now = 1_800_000_000_000;
		const t = String(now / 1000);
		const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', client_reference_id: 'pay-1', payment_status: 'paid', amount_total: 2500, currency: 'usd', payment_intent: 'pi_1' } } });
		const v1 = await stripeSignature(secret, t, body);
		const lookup = { byId: async (id: string) => (id === 'pay-1' ? ({ id } as never) : undefined), byProviderRef: async () => undefined };
		const ctx = { fetch, now: () => now };
		const creds = { secretKey: 'sk_test_x', webhookSecret: secret };
		const ok = await stripe.handleWebhook(ctx, creds, { rawBody: body, headers: new Headers({ 'stripe-signature': `t=${t},v1=${v1},v0=${v1}` }), clientIp: null }, lookup);
		expect(ok).toEqual({ ok: true, confirmations: [{ paymentId: 'pay-1', outcome: 'succeeded', providerTxId: 'pi_1', amountMinor: 2500, currency: 'USD', providerRef: 'cs_1' }] });
		// v0 alone is never accepted (downgrade protection)
		const v0only = await stripe.handleWebhook(ctx, creds, { rawBody: body, headers: new Headers({ 'stripe-signature': `t=${t},v0=${v1}` }), clientIp: null }, lookup);
		expect(v0only.ok).toBe(false);
		const late = await stripe.handleWebhook({ ...ctx, now: () => now + 301_000 }, creds, { rawBody: body, headers: new Headers({ 'stripe-signature': `t=${t},v1=${v1}` }), clientIp: null }, lookup);
		expect(late.ok).toBe(false);
	});
});
