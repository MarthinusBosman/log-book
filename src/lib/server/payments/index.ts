/**
 * Online payments orchestration: which providers a dropzone can use, starting a checkout, handling
 * provider webhooks and verifying on return. Provider specifics live in ./providers/*.
 * Runtime-agnostic (fetch + WebCrypto): the caller passes the ProviderContext and SECRETS_KEY.
 */
import type { Database } from '../db/index.ts';
import type { Dropzone, Payment } from '../db/schema.ts';
import { getPaymentConfig } from '../domain/dropzone-admin.ts';
import { DomainError } from '../domain/errors.ts';
import {
	cancelPendingOnlinePayment,
	confirmOnlinePayment,
	createOnlineTandemPayment,
	createOnlineTopUp,
	findPaymentByProviderRef,
	getPayment,
	meta,
	updatePaymentMeta,
	type ConfirmResult
} from '../domain/online-payments.ts';
import { resolveProviders, type CredsFor, type ProviderState, type ResolvedCreds } from './config.ts';
import { payfast } from './providers/payfast.ts';
import { paystack } from './providers/paystack.ts';
import { stripe } from './providers/stripe.ts';
import { yoco } from './providers/yoco.ts';
import { ONLINE_PROVIDERS, isOnlineProvider, type CheckoutResult, type Confirmation, type OnlineProviderId, type PaymentProvider, type ProviderContext } from './types.ts';

export const PROVIDERS: { [K in OnlineProviderId]: PaymentProvider<CredsFor[K]> } = { payfast, paystack, yoco, stripe };

export function getOnlineProvider<K extends OnlineProviderId>(id: K): PaymentProvider<CredsFor[K]> {
	return PROVIDERS[id];
}

export type DzPayments = { creds: ResolvedCreds; state: Record<OnlineProviderId, ProviderState>; usable: OnlineProviderId[] };

/** Providers this dropzone can take online payments with right now (in priority order). */
export async function dropzonePayments(db: Database, dz: Pick<Dropzone, 'id' | 'currency' | 'paymentsOn'>, secretsKey: string): Promise<DzPayments> {
	const { creds, state } = await resolveProviders(await getPaymentConfig(db, dz.id), secretsKey);
	const usable = !dz.paymentsOn
		? []
		: ONLINE_PROVIDERS.filter((id) => {
				const cur = PROVIDERS[id].currencies;
				return state[id].ready && !!creds[id] && (!cur || cur.includes(dz.currency.toUpperCase()));
			});
	return { creds, state, usable };
}

/** Client-safe list for pickers. */
export function providerChoices(usable: OnlineProviderId[]) {
	return usable.map((id) => ({ id, label: PROVIDERS[id].label, description: PROVIDERS[id].blurb }));
}

export function webhookUrl(origin: string, provider: OnlineProviderId, dropzoneId: string): string {
	return `${origin}/api/payments/${provider}/${dropzoneId}`;
}

type StartCommon = {
	dz: Pick<Dropzone, 'id' | 'name' | 'currency' | 'paymentsOn'>;
	provider: OnlineProviderId;
	origin: string;
	description: string;
	customer: { name?: string | null; email?: string | null; phone?: string | null };
	/** Our own paths to land on afterwards. */
	returnTo: string;
	cancelTo?: string;
	secretsKey: string;
};

export type StartResult = { payment: Payment; next: string };

async function begin(db: Database, ctx: ProviderContext, input: StartCommon, payment: Payment): Promise<StartResult> {
	const { creds } = await dropzonePayments(db, input.dz, input.secretsKey);
	const c = creds[input.provider];
	if (!c) throw new DomainError('invalid', `${PROVIDERS[input.provider].label} isn't set up at ${input.dz.name}`);
	const provider = PROVIDERS[input.provider] as PaymentProvider<typeof c>;
	let result: CheckoutResult;
	try {
		result = await provider.createCheckout(ctx, c, {
			paymentId: payment.id,
			dropzoneId: input.dz.id,
			amountMinor: payment.amountMinor,
			currency: payment.currency,
			description: input.description,
			customer: input.customer,
			returnUrl: `${input.origin}/pay/${payment.id}/return`,
			cancelUrl: `${input.origin}/pay/${payment.id}/cancel`,
			notifyUrl: webhookUrl(input.origin, input.provider, input.dz.id)
		});
	} catch (e) {
		await updatePaymentMeta(db, payment.id, { failureReason: e instanceof Error ? e.message : 'checkout failed' });
		await cancelPendingOnlinePayment(db, payment.id);
		console.warn(`[payments] ${input.provider} checkout failed for ${payment.id}:`, e);
		throw new DomainError('invalid', `${provider.label} couldn't start the payment. Please try again or choose another way to pay.`);
	}
	if (result.kind === 'redirect') {
		await updatePaymentMeta(db, payment.id, { providerRef: result.providerRef ?? null });
		return { payment, next: result.url };
	}
	await updatePaymentMeta(db, payment.id, { form: { action: result.action, fields: result.fields } });
	return { payment, next: `${input.origin}/pay/${payment.id}` };
}

export async function startTopUpCheckout(db: Database, ctx: ProviderContext, input: StartCommon & { userId: string; amountMinor: number }): Promise<StartResult> {
	const p = await createOnlineTopUp(db, { userId: input.userId, dropzoneId: input.dz.id, amountMinor: input.amountMinor, provider: input.provider, returnTo: input.returnTo, cancelTo: input.cancelTo });
	return begin(db, ctx, input, p);
}

export async function startTandemCheckout(
	db: Database,
	ctx: ProviderContext,
	input: StartCommon & { deposit: boolean; allocations: { passengerId: string; amountMinor: number }[] }
): Promise<StartResult> {
	const p = await createOnlineTandemPayment(db, { dropzoneId: input.dz.id, provider: input.provider, deposit: input.deposit, allocations: input.allocations, returnTo: input.returnTo, cancelTo: input.cancelTo });
	return begin(db, ctx, input, p);
}

async function apply(db: Database, provider: OnlineProviderId, c: Confirmation, via: 'webhook' | 'return'): Promise<ConfirmResult> {
	return confirmOnlinePayment(db, {
		paymentId: c.paymentId,
		provider,
		outcome: c.outcome,
		providerTxId: c.providerTxId,
		amountMinor: c.amountMinor,
		currency: c.currency,
		via
	});
}

export type WebhookResponse = { status: number; body: string };

/** Verify + apply a provider notification for one dropzone. Never throws (providers retry on non-2xx). */
export async function handleProviderWebhook(
	db: Database,
	ctx: ProviderContext,
	input: { provider: string; dropzoneId: string; rawBody: string; headers: Headers; clientIp: string | null; secretsKey: string }
): Promise<WebhookResponse> {
	if (!isOnlineProvider(input.provider)) return { status: 404, body: 'unknown provider' };
	const id = input.provider;
	const { creds } = await resolveProviders(await getPaymentConfig(db, input.dropzoneId), input.secretsKey);
	const c = creds[id];
	if (!c) return { status: 404, body: 'provider not configured for this dropzone' };
	const provider = PROVIDERS[id] as PaymentProvider<typeof c>;
	const scoped = (p: Payment | undefined) => (p && p.dropzoneId === input.dropzoneId && p.provider === id ? p : undefined);
	try {
		const res = await provider.handleWebhook(ctx, c, { rawBody: input.rawBody, headers: input.headers, clientIp: input.clientIp }, {
			byId: async (pid) => scoped(await getPayment(db, pid)),
			byProviderRef: async (ref) => scoped(await findPaymentByProviderRef(db, input.dropzoneId, id, ref))
		});
		if (!res.ok) {
			console.warn(`[payments] rejected ${id} webhook for dz ${input.dropzoneId}: ${res.reason}`);
			return { status: res.status, body: res.reason };
		}
		for (const conf of res.confirmations) {
			const r = await apply(db, id, conf, 'webhook');
			console.info(`[payments] ${id} ${conf.outcome} ${conf.paymentId} tx=${conf.providerTxId}${r.applied ? '' : ` (no-op: ${r.reason})`}`);
		}
		return { status: 200, body: res.note ?? 'ok' };
	} catch (e) {
		console.error(`[payments] ${id} webhook error for dz ${input.dropzoneId}`, e);
		const status = e instanceof DomainError ? 400 : 500;
		return { status, body: e instanceof Error ? e.message : 'error' };
	}
}

/** Customer is back from the provider: if still pending, ask the provider directly (when supported). */
export async function verifyOnReturn(db: Database, ctx: ProviderContext, payment: Payment, secretsKey: string): Promise<Payment> {
	if (payment.status !== 'pending' || !isOnlineProvider(payment.provider)) return payment;
	const id = payment.provider;
	const provider = PROVIDERS[id];
	if (!provider.verifyPayment) return payment;
	const { creds } = await resolveProviders(await getPaymentConfig(db, payment.dropzoneId), secretsKey);
	const c = creds[id];
	if (!c) return payment;
	try {
		const conf = await (provider as PaymentProvider<typeof c>).verifyPayment!(ctx, c, payment);
		// Only act on success here: a not-yet-finished payment stays pending for the webhook.
		if (conf && conf.outcome === 'succeeded') return (await apply(db, id, conf, 'return')).payment;
	} catch (e) {
		console.warn(`[payments] ${id} return verification failed for ${payment.id}`, e);
	}
	return (await getPayment(db, payment.id)) ?? payment;
}

/** Where the customer should land after /pay/:id/(return|cancel). */
export function landingFor(p: Payment, kind: 'return' | 'cancel'): string {
	const m = meta(p);
	const path = (kind === 'cancel' ? m.cancelTo : m.returnTo) ?? m.returnTo ?? '/';
	// Only ever our own paths (never an open redirect).
	const safe = path.startsWith('/') && !path.startsWith('//') ? path : '/';
	return `${safe}${safe.includes('?') ? '&' : '?'}payment=${encodeURIComponent(p.id)}`;
}

export { ONLINE_PROVIDERS, isOnlineProvider };
export type { OnlineProviderId };
