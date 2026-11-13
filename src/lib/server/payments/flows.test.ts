/**
 * End-to-end payment flows against the in-process provider mocks: checkout → customer pays on the
 * mock → provider webhook (signed the documented way) → our verification → domain effects.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, ledgerEntries, payments, tandemPassengers } from '../db/schema.ts';
import { savePaymentConfig } from '../domain/dropzone-admin.ts';
import { addBookingSlots, createOnlineBooking, getPassenger } from '../domain/tandems.ts';
import { getAccount } from '../domain/wallet.ts';
import { ABANDONED_CHECKOUT_MS, cancelPendingOnlinePayment, getPayment, pendingTandemCheckout } from '../domain/online-payments.ts';
import { DAY, freshDb, makeDropzone, makeUser } from '../domain/testing.ts';
import { encryptSecret } from '../staffadmin/secrets.ts';
import { saveProviderSettings } from './config.ts';
import { dropzonePayments, getOnlineProvider, handleProviderWebhook, startTandemCheckout, startTopUpCheckout, verifyOnReturn } from './index.ts';
import { createMockProviders, MOCK_PAYFAST, MOCK_STRIPE_WEBHOOK_SECRET } from './mock.ts';
import type { ProviderContext } from './types.ts';

const KEY = 'test-secrets-key';
const APP = 'http://app.test';
const MOCK = 'http://mock.test';

let db: Database;
let mock: ReturnType<typeof createMockProviders>;
let ctx: ProviderContext;

beforeEach(() => {
	db = freshDb();
	mock = createMockProviders({
		appOrigin: APP,
		// Webhooks from the mock go straight into our handler (what the route does).
		send: async (req) => {
			const m = new URL(req.url).pathname.match(/^\/api\/payments\/(\w+)\/([\w-]+)$/);
			if (!m) return new Response('no route', { status: 404 });
			const r = await handleProviderWebhook(db, ctx, { provider: m[1], dropzoneId: m[2], rawBody: await req.text(), headers: req.headers, clientIp: '127.0.0.1', secretsKey: KEY });
			return new Response(r.body, { status: r.status });
		}
	});
	ctx = { fetch: ((input: RequestInfo | URL, init?: RequestInit) => mock.handle(new Request(input, init))) as typeof fetch, mockUrl: MOCK };
});

/** Follow the hosted checkout like a browser and press "Pay" (or "Cancel"). */
async function payOnMock(next: string, button: 'pay' | 'cancel' = 'pay'): Promise<string> {
	let url = next;
	if (url.startsWith(`${APP}/pay/`)) {
		// PayFast: our /pay/:id page auto-posts the stored form.
		const p = (await getPayment(db, url.split('/').pop()!))!;
		const form = (p.metadata as { form: { action: string; fields: [string, string][] } }).form;
		const r = await mock.handle(new Request(form.action, { method: 'POST', body: new URLSearchParams(form.fields) }));
		expect(r.status).toBe(302);
		url = r.headers.get('location')!;
	}
	expect(url.startsWith(MOCK)).toBe(true);
	const done = await mock.handle(new Request(`${url}/${button}`, { method: 'POST' }));
	expect(done.status).toBe(302);
	return done.headers.get('location')!;
}

async function setup(provider: 'payfast' | 'paystack' | 'yoco' | 'stripe') {
	const { dz } = await makeDropzone(db, { paymentsOn: true, walletEnabled: true });
	if (provider === 'payfast') {
		await savePaymentConfig(db, dz.id, {
			payfastMerchantId: MOCK_PAYFAST.merchantId,
			payfastMerchantKeyEnc: await encryptSecret(MOCK_PAYFAST.merchantKey, KEY),
			payfastPassphraseEnc: await encryptSecret(MOCK_PAYFAST.passphrase, KEY),
			payfastSandbox: true
		});
	} else if (provider === 'paystack') {
		await saveProviderSettings(db, dz.id, 'paystack', { enabled: true, secrets: { secretKey: 'sk_test_paystack' } }, KEY);
	} else if (provider === 'stripe') {
		await saveProviderSettings(db, dz.id, 'stripe', { enabled: true, secrets: { secretKey: 'sk_test_stripe', webhookSecret: MOCK_STRIPE_WEBHOOK_SECRET } }, KEY);
	} else {
		await saveProviderSettings(db, dz.id, 'yoco', { enabled: true, secrets: { secretKey: 'sk_test_yoco' } }, KEY);
		const hook = await getOnlineProvider('yoco').registerWebhook!(ctx, { secretKey: 'sk_test_yoco', webhookSecret: null, webhookId: null }, `${APP}/api/payments/yoco/${dz.id}`);
		await saveProviderSettings(db, dz.id, 'yoco', { secrets: { webhookSecret: hook.secret }, plain: { webhookId: hook.id } }, KEY);
	}
	return (await db.select().from(dropzones).where(eq(dropzones.id, dz.id)))[0];
}

const common = (dz: Awaited<ReturnType<typeof setup>>) => ({ dz, origin: APP, description: 'Test payment', customer: { name: 'Jo Jumper', email: 'jo@example.com' }, secretsKey: KEY });

describe('provider availability', () => {
	test('ready only when enabled, configured, payments on, currency supported, webhook bits present', async () => {
		const { dz } = await makeDropzone(db, { paymentsOn: true });
		expect((await dropzonePayments(db, dz, KEY)).usable).toEqual([]);
		await saveProviderSettings(db, dz.id, 'stripe', { secrets: { secretKey: 'sk_test_x' } }, KEY);
		let r = await dropzonePayments(db, dz, KEY);
		expect(r.state.stripe).toMatchObject({ configured: true, ready: false, missing: 'Add the webhook signing secret', testMode: true });
		await saveProviderSettings(db, dz.id, 'stripe', { secrets: { webhookSecret: 'whsec_x' } }, KEY);
		await saveProviderSettings(db, dz.id, 'paystack', { secrets: { secretKey: 'sk_test_y' } }, KEY);
		expect((await dropzonePayments(db, dz, KEY)).usable).toEqual(['paystack', 'stripe']);
		await saveProviderSettings(db, dz.id, 'paystack', { enabled: false }, KEY);
		expect((await dropzonePayments(db, dz, KEY)).usable).toEqual(['stripe']);
		// PayFast/Yoco are ZAR-only
		await db.update(dropzones).set({ currency: 'USD' }).where(eq(dropzones.id, dz.id));
		await saveProviderSettings(db, dz.id, 'yoco', { secrets: { secretKey: 'sk_test_z', webhookSecret: 'whsec_eA==' } }, KEY);
		expect((await dropzonePayments(db, { ...dz, currency: 'USD' }, KEY)).usable).toEqual(['stripe']);
		// payments switched off → nothing
		expect((await dropzonePayments(db, { ...dz, paymentsOn: false }, KEY)).usable).toEqual([]);
		// wrong SECRETS_KEY → flagged broken, not usable
		r = await dropzonePayments(db, dz, 'another-key');
		expect(r.state.stripe.broken).toBe(true);
		expect(r.usable).toEqual([]);
	});
});

describe('wallet top-up', () => {
	for (const provider of ['paystack', 'payfast', 'yoco', 'stripe'] as const) {
		test(`${provider}: pay on mock → signed webhook → wallet credited once`, async () => {
			const dz = await setup(provider);
			const user = await makeUser(db);
			const { payment, next } = await startTopUpCheckout(db, ctx, { ...common(dz), provider, userId: user.id, amountMinor: 75000, returnTo: `/app/wallet/${dz.slug}` });
			expect(payment.status).toBe('pending');
			const back = await payOnMock(next);
			expect(back).toBe(`${APP}/pay/${payment.id}/return`.concat(provider === 'paystack' ? `?trxref=${payment.id}&reference=${payment.id}` : ''));
			expect(mock.deliveries.at(-1)).toMatchObject({ provider, status: 200 });
			const done = (await getPayment(db, payment.id))!;
			expect(done.status).toBe('succeeded');
			expect(done.providerEventId).toBeTruthy();
			expect((await getAccount(db, user.id, dz.id))!.availableMinor).toBe(75000);

			// Provider retries the same notification: no double credit.
			const last = mock.deliveries.length;
			const replay = await mock.handle(new Request(`${MOCK}/noop`)); // sanity: mock 404s unknown paths
			expect(replay.status).toBe(404);
			expect(mock.deliveries.length).toBe(last);
			const r = await handleProviderWebhook(db, ctx, { provider, dropzoneId: dz.id, rawBody: '', headers: new Headers(), clientIp: null, secretsKey: KEY });
			expect(r.status).toBeGreaterThanOrEqual(400); // unsigned junk rejected
			const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.type, 'topup'));
			expect(entries.length).toBe(1);
		});
	}

	test('replayed genuine webhook is idempotent', async () => {
		const dz = await setup('paystack');
		const user = await makeUser(db);
		const { payment, next } = await startTopUpCheckout(db, ctx, { ...common(dz), provider: 'paystack', userId: user.id, amountMinor: 20000, returnTo: '/app/wallet' });
		// Capture the webhook instead of delivering it, then deliver twice.
		const captured: Request[] = [];
		const orig = mock;
		mock = createMockProviders({ appOrigin: APP, send: async (req) => (captured.push(req.clone()), new Response('ok')) });
		orig.state.ps.forEach((v, k) => mock.state.ps.set(k, v));
		await payOnMock(next);
		expect(captured.length).toBe(1);
		for (let i = 0; i < 2; i++) {
			const req = captured[0].clone();
			const r = await handleProviderWebhook(db, ctx, { provider: 'paystack', dropzoneId: dz.id, rawBody: await req.text(), headers: req.headers, clientIp: null, secretsKey: KEY });
			expect(r.status).toBe(200);
		}
		expect((await getAccount(db, user.id, dz.id))!.availableMinor).toBe(20000);
		expect((await getPayment(db, payment.id))!.status).toBe('succeeded');
	});

	test('tampered amount is rejected and nothing is credited', async () => {
		const dz = await setup('payfast');
		const user = await makeUser(db);
		const { payment, next } = await startTopUpCheckout(db, ctx, { ...common(dz), provider: 'payfast', userId: user.id, amountMinor: 30000, returnTo: '/app/wallet' });
		// Shrink the amount in the stored form (signature then no longer matches → PayFast rejects).
		const form = (payment.metadata as never as { form?: unknown }).form;
		expect(form).toBeUndefined(); // metadata on the returned row predates the form; read fresh
		const fresh = (await getPayment(db, payment.id))!;
		const fields = (fresh.metadata as { form: { action: string; fields: [string, string][] } }).form.fields.map(([k, v]) => [k, k === 'amount' ? '1.00' : v]);
		const r = await mock.handle(new Request(`${MOCK}/payfast/eng/process`, { method: 'POST', body: new URLSearchParams(fields as [string, string][]) }));
		expect(r.status).toBe(400);
		// A forged ITN with a wrong amount but valid signature (attacker knows nothing → signature fails anyway)
		const bad = await handleProviderWebhook(db, ctx, {
			provider: 'payfast',
			dropzoneId: dz.id,
			rawBody: `m_payment_id=${payment.id}&pf_payment_id=1&payment_status=COMPLETE&amount_gross=1.00&merchant_id=${MOCK_PAYFAST.merchantId}&signature=deadbeef`,
			headers: new Headers(),
			clientIp: '8.8.8.8',
			secretsKey: KEY
		});
		expect(bad.status).toBe(400);
		expect((await getPayment(db, payment.id))!.status).toBe('pending');
		expect((await getAccount(db, user.id, dz.id))!.availableMinor).toBe(0);
		// Real flow still works afterwards.
		await payOnMock(next);
		expect((await getAccount(db, user.id, dz.id))!.availableMinor).toBe(30000);
	});

	test('cancel on the provider page leaves the wallet untouched', async () => {
		const dz = await setup('yoco');
		const user = await makeUser(db);
		const { payment, next } = await startTopUpCheckout(db, ctx, { ...common(dz), provider: 'yoco', userId: user.id, amountMinor: 10000, returnTo: '/app/wallet' });
		const back = await payOnMock(next, 'cancel');
		expect(back).toBe(`${APP}/pay/${payment.id}/cancel`);
		expect((await getPayment(db, payment.id))!.status).toBe('pending');
		expect(mock.deliveries.length).toBe(0);
	});

	test('return verification confirms when the webhook never arrived (Paystack verify, Stripe session)', async () => {
		for (const provider of ['paystack', 'stripe'] as const) {
			const dz = await setup(provider);
			const user = await makeUser(db);
			mock = createMockProviders({ appOrigin: undefined, send: async () => new Response('dropped', { status: 500 }) });
			const { payment, next } = await startTopUpCheckout(db, ctx, { ...common(dz), provider, userId: user.id, amountMinor: 40000, returnTo: '/app/wallet' });
			await payOnMock(next);
			expect((await getPayment(db, payment.id))!.status).toBe('pending');
			const after = await verifyOnReturn(db, ctx, (await getPayment(db, payment.id))!, KEY);
			expect(after.status).toBe('succeeded');
			expect((await getAccount(db, user.id, dz.id))!.availableMinor).toBe(40000);
		}
	});
});

describe('tandem booking', () => {
	test('group deposit via PayFast ITN marks every passenger deposit_paid', async () => {
		const dz = await setup('payfast');
		await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '09:00', capacity: 4 });
		const res = await createOnlineBooking(db, { dropzoneId: dz.id, date: DAY, time: '09:00', jumpers: [{ name: 'Ann Bee', email: 'a@x.co' }, { name: 'Cee Dee', email: 'c@x.co' }] });
		const each = res.depositMinor / 2;
		const { payment, next } = await startTandemCheckout(db, ctx, {
			...common(dz),
			provider: 'payfast',
			deposit: true,
			allocations: res.passengers.map((p) => ({ passengerId: p.id, amountMinor: each })),
			returnTo: `/dz/${dz.slug}/book/${res.passengers[0].confirmationNumber}`
		});
		expect(payment.amountMinor).toBe(res.depositMinor);
		await payOnMock(next);
		expect(mock.deliveries.at(-1)).toMatchObject({ provider: 'payfast', status: 200 });
		for (const p of res.passengers) {
			const fresh = (await getPassenger(db, p.id))!;
			expect(fresh).toMatchObject({ paymentStatus: 'deposit_paid', amountPaidMinor: each, depositMinor: each, paymentMethod: 'payfast' });
		}
		const rows = await db.select().from(payments).where(eq(payments.dropzoneId, dz.id));
		expect(rows.length).toBe(1);
		expect(rows[0]).toMatchObject({ status: 'succeeded', purpose: 'tandem_deposit' });
	});

	test('balance payment via Stripe marks the passenger paid', async () => {
		const dz = await setup('stripe');
		await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '09:00', capacity: 2 });
		const res = await createOnlineBooking(db, { dropzoneId: dz.id, date: DAY, time: '09:00', jumpers: [{ name: 'Ann', email: 'a@x.co' }] });
		const p = res.passengers[0];
		const { next } = await startTandemCheckout(db, ctx, { ...common(dz), provider: 'stripe', deposit: false, allocations: [{ passengerId: p.id, amountMinor: p.totalMinor }], returnTo: '/x' });
		await payOnMock(next);
		const fresh = (await db.select().from(tandemPassengers).where(eq(tandemPassengers.id, p.id)))[0];
		expect(fresh).toMatchObject({ paymentStatus: 'paid', amountPaidMinor: p.totalMinor, paymentMethod: 'stripe' });
	});

	test('abandoned group checkout is found for every covered passenger until paid, cancelled or expired', async () => {
		const dz = await setup('paystack');
		await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '09:00', capacity: 4 });
		const res = await createOnlineBooking(db, { dropzoneId: dz.id, date: DAY, time: '09:00', jumpers: [{ name: 'Ann', email: 'a@x.co' }, { name: 'Bob', email: 'b@x.co' }] });
		const solo = await createOnlineBooking(db, { dropzoneId: dz.id, date: DAY, time: '09:00', jumpers: [{ name: 'Cid', email: 'c@x.co' }] });
		const [ann, bob] = res.passengers;
		expect(await pendingTandemCheckout(db, dz.id, ann.id)).toBeUndefined();
		const { payment } = await startTandemCheckout(db, ctx, {
			...common(dz),
			provider: 'paystack',
			deposit: true,
			allocations: res.passengers.map((p) => ({ passengerId: p.id, amountMinor: 100 })),
			returnTo: '/x'
		});
		// Customer never pays: both covered passengers see it, an unrelated booking doesn't.
		expect((await pendingTandemCheckout(db, dz.id, ann.id))?.id).toBe(payment.id);
		expect((await pendingTandemCheckout(db, dz.id, bob.id))?.id).toBe(payment.id);
		expect(await pendingTandemCheckout(db, dz.id, solo.passengers[0].id)).toBeUndefined();
		// Past the housekeeping window it is no longer offered.
		expect(await pendingTandemCheckout(db, dz.id, ann.id, Date.now() + ABANDONED_CHECKOUT_MS + 60_000)).toBeUndefined();
		await cancelPendingOnlinePayment(db, payment.id);
		expect(await pendingTandemCheckout(db, dz.id, ann.id)).toBeUndefined();
	});

	test("can't pay for another dropzone's passenger", async () => {
		const a = await setup('paystack');
		const { dz: b } = await makeDropzone(db);
		await addBookingSlots(db, { dropzoneId: b.id, date: DAY, time: '09:00', capacity: 2 });
		const res = await createOnlineBooking(db, { dropzoneId: b.id, date: DAY, time: '09:00', jumpers: [{ name: 'Ann', email: 'a@x.co' }] });
		await expect(
			startTandemCheckout(db, ctx, { ...common(a), provider: 'paystack', deposit: true, allocations: [{ passengerId: res.passengers[0].id, amountMinor: 100 }], returnTo: '/x' })
		).rejects.toThrow(/not found/i);
	});
});

describe('test connection (mock)', () => {
	test('each provider reports good and bad credentials', async () => {
		expect((await getOnlineProvider('payfast').testConnection!(ctx, { ...MOCK_PAYFAST, sandbox: true })).ok).toBe(true);
		expect((await getOnlineProvider('payfast').testConnection!(ctx, { ...MOCK_PAYFAST, passphrase: 'wrong', sandbox: true })).ok).toBe(false);
		expect((await getOnlineProvider('payfast').testConnection!(ctx, { ...MOCK_PAYFAST, passphrase: null, sandbox: true })).message).toMatch(/passphrase/);
		expect((await getOnlineProvider('paystack').testConnection!(ctx, { secretKey: 'sk_test_ok' })).ok).toBe(true);
		expect((await getOnlineProvider('paystack').testConnection!(ctx, { secretKey: 'sk_test_bad' })).ok).toBe(false);
		expect((await getOnlineProvider('yoco').testConnection!(ctx, { secretKey: 'sk_test_ok', webhookSecret: null, webhookId: null })).ok).toBe(true);
		expect((await getOnlineProvider('stripe').testConnection!(ctx, { secretKey: 'sk_test_bad', webhookSecret: null })).ok).toBe(false);
	});

	test('refunds hit the provider APIs', async () => {
		const dz = await setup('stripe');
		const user = await makeUser(db);
		const { payment, next } = await startTopUpCheckout(db, ctx, { ...common(dz), provider: 'stripe', userId: user.id, amountMinor: 1000, returnTo: '/x' });
		await payOnMock(next);
		const paid = (await getPayment(db, payment.id))!;
		expect(paid.providerEventId).toMatch(/^pi_/);
		expect((await getOnlineProvider('stripe').refund!(ctx, { secretKey: 'sk_test_s', webhookSecret: null }, paid)).ok).toBe(true);
		expect((await getOnlineProvider('payfast').refund!(ctx, { ...MOCK_PAYFAST, sandbox: true }, { ...paid, providerEventId: '123' })).ok).toBe(true);
	});
});
