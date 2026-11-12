/**
 * Per-dropzone provider settings: decrypt for use, mask for the UI, save from the settings form.
 * Secrets are AES-GCM encrypted with SECRETS_KEY (staffadmin/secrets.ts) and never sent to the
 * browser — the UI only ever sees `maskSecret()` output.
 */
import type { Database } from '../db/index.ts';
import type { DropzonePaymentConfig } from '../db/schema.ts';
import { getPaymentConfig, savePaymentConfig } from '../domain/dropzone-admin.ts';
import { decryptSecret, encryptSecret, maskSecret } from '../staffadmin/secrets.ts';
import type { PayfastCreds } from './providers/payfast.ts';
import type { PaystackCreds } from './providers/paystack.ts';
import type { StripeCreds } from './providers/stripe.ts';
import type { YocoCreds } from './providers/yoco.ts';
import { ONLINE_PROVIDERS, type OnlineProviderId } from './types.ts';

/** Stored in dropzone_payment_configs.providers (JSON). PayFast credentials use their own columns. */
export type ProviderSettings = {
	payfast?: { enabled?: boolean };
	paystack?: { enabled?: boolean; secretKeyEnc?: string | null; publicKey?: string | null };
	yoco?: { enabled?: boolean; secretKeyEnc?: string | null; webhookSecretEnc?: string | null; webhookId?: string | null };
	stripe?: { enabled?: boolean; secretKeyEnc?: string | null; webhookSecretEnc?: string | null };
};

export type CredsFor = { payfast: PayfastCreds; paystack: PaystackCreds; yoco: YocoCreds; stripe: StripeCreds };
export type ResolvedCreds = { [K in OnlineProviderId]?: CredsFor[K] };

export type ProviderState = {
	id: OnlineProviderId;
	/** Credentials saved. */
	configured: boolean;
	/** Owner switched it on. */
	enabled: boolean;
	/** Can take payments right now (configured + enabled + webhook bits present). */
	ready: boolean;
	testMode: boolean;
	/** What's still missing before it's ready. */
	missing: string | null;
	/** Stored secret couldn't be decrypted (SECRETS_KEY changed). */
	broken: boolean;
};

export function providerSettings(cfg: DropzonePaymentConfig | undefined): ProviderSettings {
	return (cfg?.providers ?? {}) as ProviderSettings;
}

async function dec(v: string | null | undefined, key: string): Promise<string | null | undefined> {
	if (!v) return undefined;
	return decryptSecret(v, key); // null = can't decrypt
}

const isTestKey = (k: string | null | undefined) => !!k && /^(sk|rk|pk)_test_/.test(k);

/** Decrypt everything a dropzone has saved. */
export async function resolveProviders(cfg: DropzonePaymentConfig | undefined, secretsKey: string): Promise<{ creds: ResolvedCreds; state: Record<OnlineProviderId, ProviderState> }> {
	const s = providerSettings(cfg);
	const creds: ResolvedCreds = {};
	const state = {} as Record<OnlineProviderId, ProviderState>;
	const put = (id: OnlineProviderId, p: Omit<ProviderState, 'id' | 'ready'>) => {
		state[id] = { id, ...p, ready: p.configured && p.enabled && !p.missing && !p.broken };
	};

	// PayFast
	{
		const key = await dec(cfg?.payfastMerchantKeyEnc, secretsKey);
		const pass = await dec(cfg?.payfastPassphraseEnc, secretsKey);
		const configured = !!cfg?.payfastMerchantId && key !== undefined;
		const broken = key === null || pass === null;
		if (configured && key && !broken) creds.payfast = { merchantId: cfg!.payfastMerchantId!, merchantKey: key, passphrase: pass ?? null, sandbox: cfg!.payfastSandbox };
		put('payfast', { configured, enabled: s.payfast?.enabled ?? true, testMode: cfg?.payfastSandbox ?? true, missing: null, broken });
	}
	// Paystack
	{
		const sk = await dec(s.paystack?.secretKeyEnc, secretsKey);
		if (sk) creds.paystack = { secretKey: sk };
		put('paystack', { configured: sk !== undefined, enabled: s.paystack?.enabled ?? true, testMode: isTestKey(sk), missing: null, broken: sk === null });
	}
	// Yoco
	{
		const sk = await dec(s.yoco?.secretKeyEnc, secretsKey);
		const wh = await dec(s.yoco?.webhookSecretEnc, secretsKey);
		if (sk) creds.yoco = { secretKey: sk, webhookSecret: wh ?? null, webhookId: s.yoco?.webhookId ?? null };
		put('yoco', {
			configured: sk !== undefined,
			enabled: s.yoco?.enabled ?? true,
			testMode: isTestKey(sk),
			missing: sk && !wh ? 'Register the webhook' : null,
			broken: sk === null || wh === null
		});
	}
	// Stripe
	{
		const sk = await dec(s.stripe?.secretKeyEnc, secretsKey);
		const wh = await dec(s.stripe?.webhookSecretEnc, secretsKey);
		if (sk) creds.stripe = { secretKey: sk, webhookSecret: wh ?? null };
		put('stripe', {
			configured: sk !== undefined,
			enabled: s.stripe?.enabled ?? true,
			testMode: isTestKey(sk),
			missing: sk && !wh ? 'Add the webhook signing secret' : null,
			broken: sk === null || wh === null
		});
	}
	return { creds, state };
}

/** Masked view of every stored secret, for the settings page. */
export async function maskedSecrets(cfg: DropzonePaymentConfig | undefined, secretsKey: string) {
	const s = providerSettings(cfg);
	const m = async (v: string | null | undefined) => {
		if (!v) return null;
		const plain = await decryptSecret(v, secretsKey);
		return plain === null ? 'Stored (can’t decrypt — re-enter)' : maskSecret(plain);
	};
	return {
		payfast: { merchantId: cfg?.payfastMerchantId ?? null, merchantKey: await m(cfg?.payfastMerchantKeyEnc), passphrase: await m(cfg?.payfastPassphraseEnc), sandbox: cfg?.payfastSandbox ?? true },
		paystack: { secretKey: await m(s.paystack?.secretKeyEnc), publicKey: s.paystack?.publicKey ?? null },
		yoco: { secretKey: await m(s.yoco?.secretKeyEnc), webhookSecret: await m(s.yoco?.webhookSecretEnc), webhookId: s.yoco?.webhookId ?? null },
		stripe: { secretKey: await m(s.stripe?.secretKeyEnc), webhookSecret: await m(s.stripe?.webhookSecretEnc) }
	};
}

/** Merge a patch into one provider's JSON settings (encrypting any plain secrets given). */
export async function saveProviderSettings<K extends Exclude<OnlineProviderId, 'payfast'> | 'payfast'>(
	db: Database,
	dropzoneId: string,
	id: K,
	patch: { enabled?: boolean; secrets?: Record<string, string | null>; plain?: Record<string, string | null> },
	secretsKey: string
): Promise<void> {
	const cfg = await getPaymentConfig(db, dropzoneId);
	const all = { ...providerSettings(cfg) } as Record<string, Record<string, unknown>>;
	const cur = { ...(all[id] ?? {}) };
	if (patch.enabled !== undefined) cur.enabled = patch.enabled;
	for (const [k, v] of Object.entries(patch.plain ?? {})) cur[k] = v;
	for (const [k, v] of Object.entries(patch.secrets ?? {})) cur[`${k}Enc`] = v === null ? null : await encryptSecret(v, secretsKey);
	all[id] = cur;
	await savePaymentConfig(db, dropzoneId, { providers: all });
}

/** Remove a provider's stored settings entirely. */
export async function clearProviderSettings(db: Database, dropzoneId: string, id: OnlineProviderId): Promise<void> {
	const cfg = await getPaymentConfig(db, dropzoneId);
	const all = { ...providerSettings(cfg) } as Record<string, unknown>;
	delete all[id];
	await savePaymentConfig(db, dropzoneId, { providers: all as DropzonePaymentConfig['providers'] });
}

export { ONLINE_PROVIDERS };
