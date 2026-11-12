/**
 * PayFast (South Africa) — custom integration: signed form post to /eng/process, ITN (Instant
 * Transaction Notification) to our notify_url, verified with all four documented checks:
 * signature, source IP, amount, and server confirmation via /eng/query/validate.
 * Docs: https://developers.payfast.co.za/docs (Custom integration, ITN, Ports & IPs),
 *       https://developers.payfast.co.za/api (ping, refunds, API signature).
 */
import { md5, phpUrlencode, safeEqual } from '../crypto.ts';
import {
	fromDecimal,
	ProviderError,
	toDecimal,
	type CheckoutInput,
	type CheckoutResult,
	type Confirmation,
	type PaymentProvider,
	type ProviderContext,
	type WebhookResult
} from '../types.ts';

export type PayfastCreds = { merchantId: string; merchantKey: string; passphrase: string | null; sandbox: boolean };

/** Published PayFast server ranges (developers.payfast.co.za/docs#ports-ips). */
export const PAYFAST_IP_RANGES = ['197.97.145.144/28', '41.74.179.192/27', '102.216.36.0/28', '102.216.36.128/28', '144.126.193.139/32'];

function hosts(ctx: ProviderContext, sandbox: boolean) {
	if (ctx.mockUrl) {
		const m = `${ctx.mockUrl}/payfast`;
		return { process: `${m}/eng/process`, validate: `${m}/eng/query/validate`, api: `${m}/api` };
	}
	const host = sandbox ? 'https://sandbox.payfast.co.za' : 'https://www.payfast.co.za';
	return { process: `${host}/eng/process`, validate: `${host}/eng/query/validate`, api: 'https://api.payfast.co.za' };
}

/**
 * Checkout signature: non-blank fields IN THE GIVEN (documented) ORDER, values trimmed and
 * PHP-urlencoded, `&passphrase=…` appended, MD5.
 */
export function checkoutSignature(fields: [string, string][], passphrase: string | null): string {
	let s = fields
		.filter(([, v]) => v.trim() !== '')
		.map(([k, v]) => `${k}=${phpUrlencode(v.trim())}`)
		.join('&');
	if (passphrase) s += `&passphrase=${phpUrlencode(passphrase.trim())}`;
	return md5(s);
}

/** ITN param string: every posted pair before `signature`, in posted order (blank ones included). */
export function itnParamString(body: string): { paramString: string; data: Record<string, string>; signature: string | null } {
	const pairs = [...new URLSearchParams(body)];
	const data: Record<string, string> = {};
	const parts: string[] = [];
	let signature: string | null = null;
	let seenSig = false;
	for (const [k, v] of pairs) {
		data[k] = v;
		if (k === 'signature') {
			signature = v;
			seenSig = true;
			continue;
		}
		if (!seenSig) parts.push(`${k}=${phpUrlencode(v)}`);
	}
	return { paramString: parts.join('&'), data, signature };
}

export function itnSignature(paramString: string, passphrase: string | null): string {
	return md5(passphrase ? `${paramString}&passphrase=${phpUrlencode(passphrase.trim())}` : paramString);
}

/** API signature: header + body vars + passphrase, sorted alphabetically, PHP-urlencoded, MD5. */
export function apiSignature(vars: Record<string, string>, passphrase: string): string {
	const all: Record<string, string> = { ...vars, passphrase };
	return md5(
		Object.keys(all)
			.sort()
			.filter((k) => all[k] !== '')
			.map((k) => `${k}=${phpUrlencode(all[k])}`)
			.join('&')
	);
}

function ipToInt(ip: string): number | null {
	const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return null;
	const o = m.slice(1).map(Number);
	if (o.some((x) => x > 255)) return null;
	return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

export function ipInRanges(ip: string, ranges = PAYFAST_IP_RANGES): boolean {
	const n = ipToInt(ip.replace(/^::ffff:/, ''));
	if (n === null) return false;
	return ranges.some((r) => {
		const [base, bits] = r.split('/');
		const b = ipToInt(base);
		if (b === null) return false;
		const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
		return (n & mask) === (b & mask);
	});
}

/** Loopback/private addresses: the app sits behind a proxy that hides the caller (or a local mock). */
export function isPrivateIp(ip: string | null): boolean {
	if (!ip) return true;
	const v4 = ip.replace(/^::ffff:/, '');
	if (v4 === '::1' || v4 === 'localhost') return true;
	return ipInRanges(v4, ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '100.64.0.0/10']) || /^f[cd]/i.test(v4);
}

function splitName(name: string | null | undefined): [string, string] {
	const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return ['', ''];
	return [parts[0].slice(0, 100), parts.slice(1).join(' ').slice(0, 100)];
}

/** PayFast's timestamp format: YYYY-MM-DDTHH:MM:SS (UTC with explicit offset). */
function pfTimestamp(now: number): string {
	return new Date(now).toISOString().slice(0, 19) + '+00:00';
}

async function apiCall(ctx: ProviderContext, creds: PayfastCreds, method: 'GET' | 'POST', path: string, body?: Record<string, string>) {
	if (!creds.passphrase) throw new ProviderError('Set a passphrase (PayFast dashboard → Settings → Security pass phrase) to use the PayFast API.');
	const headers: Record<string, string> = {
		'merchant-id': creds.merchantId,
		version: 'v1',
		timestamp: pfTimestamp(ctx.now?.() ?? Date.now())
	};
	headers.signature = apiSignature({ ...headers, ...(body ?? {}) }, creds.passphrase);
	const url = `${hosts(ctx, creds.sandbox).api}${path}${creds.sandbox ? '?testing=true' : ''}`;
	return ctx.fetch(url, {
		method,
		headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
}

export const payfast: PaymentProvider<PayfastCreds> = {
	id: 'payfast',
	label: 'PayFast',
	blurb: 'Card, Instant EFT, Capitec Pay, SnapScan and more via PayFast.',
	currencies: ['ZAR'],

	async createCheckout(ctx, creds, input: CheckoutInput): Promise<CheckoutResult> {
		if (input.currency.toUpperCase() !== 'ZAR') throw new ProviderError('PayFast only takes payments in ZAR.');
		const [first, last] = splitName(input.customer.name);
		// Order matters: the documented attribute order (Custom integration → Step 1).
		const fields: [string, string][] = [
			['merchant_id', creds.merchantId],
			['merchant_key', creds.merchantKey],
			['return_url', input.returnUrl],
			['cancel_url', input.cancelUrl],
			['notify_url', input.notifyUrl],
			['name_first', first],
			['name_last', last],
			['email_address', (input.customer.email ?? '').slice(0, 100)],
			['m_payment_id', input.paymentId],
			['amount', toDecimal(input.amountMinor)],
			['item_name', input.description.slice(0, 100)],
			['custom_str1', input.dropzoneId]
		];
		const kept = fields.filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, v.trim()] as [string, string]);
		kept.push(['signature', checkoutSignature(kept, creds.passphrase)]);
		return { kind: 'form', action: hosts(ctx, creds.sandbox).process, fields: kept };
	},

	async handleWebhook(ctx, creds, req, lookup): Promise<WebhookResult> {
		const { paramString, data, signature } = itnParamString(req.rawBody);
		// 1. signature
		if (!signature || !safeEqual(itnSignature(paramString, creds.passphrase), signature.toLowerCase())) {
			return { ok: false, status: 400, reason: 'PayFast ITN: signature mismatch' };
		}
		if (data.merchant_id !== creds.merchantId) return { ok: false, status: 400, reason: 'PayFast ITN: merchant id mismatch' };
		// 2. source IP (skipped for private/loopback callers: local mock, or a proxy that hides the
		//    caller — set ADDRESS_HEADER on self-hosted installs; checks 1, 3 and 4 still apply).
		if (!ctx.mockUrl && req.clientIp && !isPrivateIp(req.clientIp) && !ipInRanges(req.clientIp)) {
			return { ok: false, status: 403, reason: `PayFast ITN: unexpected source ${req.clientIp}` };
		}
		// 3. amount
		const payment = data.m_payment_id ? await lookup.byId(data.m_payment_id) : undefined;
		if (!payment) return { ok: false, status: 404, reason: 'PayFast ITN: unknown m_payment_id' };
		const gross = fromDecimal(data.amount_gross);
		if (!Number.isFinite(gross) || Math.abs(gross - payment.amountMinor) > 1) {
			return { ok: false, status: 400, reason: `PayFast ITN: amount ${data.amount_gross} doesn't match ${toDecimal(payment.amountMinor)}` };
		}
		// 4. server confirmation
		const res = await ctx.fetch(hosts(ctx, creds.sandbox).validate, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: paramString
		});
		const verdict = (await res.text()).trim();
		if (!res.ok || verdict !== 'VALID') return { ok: false, status: 400, reason: `PayFast ITN: validate endpoint said ${verdict.slice(0, 40) || res.status}` };

		const status = (data.payment_status ?? '').toUpperCase();
		const outcome: Confirmation['outcome'] | null = status === 'COMPLETE' ? 'succeeded' : status === 'CANCELLED' ? 'cancelled' : status === 'FAILED' ? 'failed' : null;
		if (!outcome || !data.pf_payment_id) return { ok: true, confirmations: [], note: `ignored status ${status}` };
		return {
			ok: true,
			confirmations: [{ paymentId: payment.id, outcome, providerTxId: data.pf_payment_id, amountMinor: gross, currency: 'ZAR', providerRef: data.pf_payment_id }]
		};
	},

	async testConnection(ctx, creds) {
		try {
			const res = await apiCall(ctx, creds, 'GET', '/ping');
			const text = (await res.text()).trim();
			if (res.ok) return { ok: true, message: `PayFast API answered (${text.replace(/"/g, '') || 'OK'}).` };
			return { ok: false, message: `PayFast rejected the credentials (${res.status}). Check the merchant ID and passphrase.` };
		} catch (e) {
			return { ok: false, message: e instanceof Error ? e.message : 'PayFast ping failed' };
		}
	},

	async refund(ctx, creds, payment, amountMinor) {
		const pfId = payment.providerEventId ?? payment.providerRef;
		if (!pfId) return { ok: false, message: 'No PayFast payment id on this payment.' };
		const res = await apiCall(ctx, creds, 'POST', `/refunds/${encodeURIComponent(pfId)}`, {
			amount: String(amountMinor ?? payment.amountMinor),
			reason: 'Refund from dropzone',
			notify_buyer: '1'
		});
		const body = (await res.json().catch(() => null)) as { status?: string; data?: { message?: string; response?: unknown } } | null;
		return res.ok
			? { ok: true, message: 'Refund submitted to PayFast.', refundId: pfId }
			: { ok: false, message: `PayFast refund failed (${res.status})${body?.data?.message ? `: ${body.data.message}` : ''}` };
	}
};
