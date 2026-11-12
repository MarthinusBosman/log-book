/**
 * Shared types for online payment providers. Every provider talks to the DROPZONE'S OWN merchant
 * account (credentials per dropzone); the platform never holds money or takes a fee.
 */
import type { Payment } from '../db/schema.ts';

export const ONLINE_PROVIDERS = ['payfast', 'paystack', 'yoco', 'stripe'] as const;
export type OnlineProviderId = (typeof ONLINE_PROVIDERS)[number];

export function isOnlineProvider(id: string): id is OnlineProviderId {
	return (ONLINE_PROVIDERS as readonly string[]).includes(id);
}

/** Runtime context: injectable fetch (tests use the in-process mock) + optional mock base URL. */
export type ProviderContext = {
	fetch: typeof fetch;
	/** Local mock server origin (PAYMENTS_MOCK_URL). When set, every provider URL points at it. */
	mockUrl?: string | null;
	now?: () => number;
};

export type CheckoutInput = {
	/** Our payments.id — sent to the provider as the merchant reference. */
	paymentId: string;
	dropzoneId: string;
	amountMinor: number;
	/** ISO 4217, upper case. */
	currency: string;
	/** Short item name shown on the provider's page. */
	description: string;
	customer: { name?: string | null; email?: string | null; phone?: string | null };
	returnUrl: string;
	cancelUrl: string;
	/** Our webhook / ITN URL for this dropzone + provider. */
	notifyUrl: string;
};

export type CheckoutResult =
	/** Send the customer to this hosted checkout URL. `providerRef` = provider's checkout/session id. */
	| { kind: 'redirect'; url: string; providerRef?: string | null }
	/** Auto-post this form to the provider (PayFast). */
	| { kind: 'form'; action: string; fields: [string, string][] };

/** A verified statement from the provider about one of our payments. */
export type Confirmation = {
	paymentId: string;
	outcome: 'succeeded' | 'failed' | 'cancelled';
	/** Provider transaction id — the idempotency key (payments.provider_event_id). */
	providerTxId: string;
	amountMinor: number;
	currency: string;
	providerRef?: string | null;
};

export type WebhookInput = {
	rawBody: string;
	headers: Headers;
	/** Caller IP as seen by the server (for PayFast's source check). */
	clientIp: string | null;
};

export type WebhookResult =
	| { ok: true; confirmations: Confirmation[]; note?: string }
	| { ok: false; status: number; reason: string };

export type TestResult = { ok: boolean; message: string };

export type RefundResult = { ok: boolean; message: string; refundId?: string | null };

/** Looks up our payments (to check amount and dropzone while verifying), scoped to one dropzone. */
export type PaymentLookup = {
	byId(paymentId: string): Promise<Payment | undefined>;
	/** By the provider's checkout/session id stored in payments.provider_ref. */
	byProviderRef(ref: string): Promise<Payment | undefined>;
};

export interface PaymentProvider<C> {
	readonly id: OnlineProviderId;
	readonly label: string;
	/** Customer-facing one-liner. */
	readonly blurb: string;
	/** Supported currencies (upper case), or null = any the merchant account supports. */
	readonly currencies: readonly string[] | null;
	createCheckout(ctx: ProviderContext, creds: C, input: CheckoutInput): Promise<CheckoutResult>;
	/** Verify an incoming webhook/ITN and translate it into confirmations. Never trusts unverified data. */
	handleWebhook(ctx: ProviderContext, creds: C, req: WebhookInput, lookup: PaymentLookup): Promise<WebhookResult>;
	/** On the customer's return: ask the provider for the payment's status (server-to-server). */
	verifyPayment?(ctx: ProviderContext, creds: C, payment: Payment): Promise<Confirmation | null>;
	/** Cheap authenticated call proving the credentials work. */
	testConnection?(ctx: ProviderContext, creds: C): Promise<TestResult>;
	refund?(ctx: ProviderContext, creds: C, payment: Payment, amountMinor?: number): Promise<RefundResult>;
	/** Providers without a dashboard webhook setting (Yoco): register our URL, get the signing secret. */
	registerWebhook?(ctx: ProviderContext, creds: C, url: string): Promise<{ id: string; secret: string }>;
}

export class ProviderError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
	}
}

/** Read a JSON response, throwing a readable ProviderError for non-2xx. */
export async function jsonOrThrow<T>(res: Response, what: string): Promise<T> {
	const text = await res.text();
	let body: unknown = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		/* not JSON */
	}
	if (!res.ok) {
		const b = body as { message?: string; error?: { message?: string }; description?: string } | null;
		const msg = b?.error?.message ?? b?.message ?? b?.description ?? text.slice(0, 200);
		throw new ProviderError(`${what} failed (${res.status})${msg ? `: ${msg}` : ''}`, res.status);
	}
	return body as T;
}

/** Minor units → "123.45" (2-decimal currencies; all our providers' currencies are 2-decimal). */
export function toDecimal(minor: number): string {
	return (minor / 100).toFixed(2);
}

/** "123.45" → 12345; NaN for garbage. */
export function fromDecimal(s: string | null | undefined): number {
	if (s == null || !/^-?\d+(\.\d{1,2})?$/.test(s.trim())) return NaN;
	return Math.round(Number(s) * 100);
}
