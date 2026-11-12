import { fail } from '@sveltejs/kit';
import { APP_ORIGIN, SECRETS_KEY } from '$app/env/private';
import { formatMoney } from '#lib/domain/constants.ts';
import { getPaymentConfig, savePaymentConfig } from '#lib/server/domain/dropzone-admin.ts';
import { listOnlinePayments } from '#lib/server/domain/online-payments.ts';
import { encryptSecret, usingDevKey } from '#lib/server/staffadmin/secrets.ts';
import { bool, requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import { clearProviderSettings, maskedSecrets, resolveProviders, saveProviderSettings } from '#lib/server/payments/config.ts';
import { ONLINE_PROVIDERS, PROVIDERS, isOnlineProvider, webhookUrl, type OnlineProviderId } from '#lib/server/payments/index.ts';
import { paymentsContext } from '#lib/server/payments/runtime.ts';
import type { PaymentProvider } from '#lib/server/payments/types.ts';
import { publicOrigin } from '#lib/server/tandems/http.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { dz } = await requirePage(event, 'dz.settings');
	const cfg = await getPaymentConfig(event.locals.db, dz.id);
	const [{ state }, masked, recent] = await Promise.all([
		resolveProviders(cfg, SECRETS_KEY),
		maskedSecrets(cfg, SECRETS_KEY),
		listOnlinePayments(event.locals.db, dz.id, [...ONLINE_PROVIDERS], 10)
	]);
	const origin = publicOrigin(event.url, APP_ORIGIN);
	return {
		currency: dz.currency,
		paymentsOn: dz.paymentsOn,
		walletEnabled: dz.walletEnabled,
		devKey: usingDevKey(SECRETS_KEY),
		state,
		masked,
		supported: Object.fromEntries(ONLINE_PROVIDERS.map((id) => [id, !PROVIDERS[id].currencies || PROVIDERS[id].currencies!.includes(dz.currency.toUpperCase())])) as Record<OnlineProviderId, boolean>,
		webhooks: Object.fromEntries(ONLINE_PROVIDERS.map((id) => [id, webhookUrl(origin, id, dz.id)])) as Record<OnlineProviderId, string>,
		recent: recent.map((p) => ({
			id: p.id,
			provider: isOnlineProvider(p.provider) ? PROVIDERS[p.provider].label : p.provider,
			purpose: p.purpose,
			status: p.status,
			amount: formatMoney(p.amountMinor, p.currency),
			createdAt: p.createdAt.getTime()
		}))
	};
};

const keyRe = { paystack: /^sk_(test|live)_[A-Za-z0-9]{10,}$/, yoco: /^sk_(test|live)_[A-Za-z0-9]{10,}$/, stripe: /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/ };

export const actions: Actions = {
	payfast: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const f = await event.request.formData();
			const merchantId = str(f, 'merchantId');
			if (!/^\d{5,12}$/.test(merchantId)) return fail(400, { message: 'PayFast merchant ID is a number (5–12 digits).' });
			const cfg = await getPaymentConfig(event.locals.db, dz.id);
			const key = str(f, 'merchantKey');
			const pass = str(f, 'passphrase');
			if (key && !/^[a-z0-9]{8,32}$/i.test(key)) return fail(400, { message: 'PayFast merchant key looks wrong (8–32 letters and numbers).' });
			if (!key && !cfg?.payfastMerchantKeyEnc) return fail(400, { message: 'Enter the PayFast merchant key.' });
			if (pass && pass.length < 6) return fail(400, { message: 'The passphrase must be at least 6 characters.' });
			await savePaymentConfig(event.locals.db, dz.id, {
				payfastMerchantId: merchantId,
				...(key ? { payfastMerchantKeyEnc: await encryptSecret(key, SECRETS_KEY) } : {}),
				...(pass ? { payfastPassphraseEnc: await encryptSecret(pass, SECRETS_KEY) } : {}),
				payfastSandbox: bool(f, 'sandbox')
			});
			await saveProviderSettings(event.locals.db, dz.id, 'payfast', { enabled: bool(f, 'enabled') }, SECRETS_KEY);
			return { message: 'PayFast details saved' };
		}),

	paystack: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const f = await event.request.formData();
			const sk = str(f, 'secretKey');
			const cfg = await resolveProviders(await getPaymentConfig(event.locals.db, dz.id), SECRETS_KEY);
			if (sk && !keyRe.paystack.test(sk)) return fail(400, { message: 'A Paystack secret key starts with sk_test_ or sk_live_.' });
			if (!sk && !cfg.state.paystack.configured) return fail(400, { message: 'Paste your Paystack secret key.' });
			await saveProviderSettings(event.locals.db, dz.id, 'paystack', { enabled: bool(f, 'enabled'), ...(sk ? { secrets: { secretKey: sk } } : {}) }, SECRETS_KEY);
			return { message: 'Paystack details saved' };
		}),

	yoco: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const f = await event.request.formData();
			const sk = str(f, 'secretKey');
			const cfg = await resolveProviders(await getPaymentConfig(event.locals.db, dz.id), SECRETS_KEY);
			if (sk && !keyRe.yoco.test(sk)) return fail(400, { message: 'A Yoco secret key starts with sk_test_ or sk_live_.' });
			if (!sk && !cfg.state.yoco.configured) return fail(400, { message: 'Paste your Yoco secret key.' });
			// A new key = possibly a new Yoco account/mode: the old webhook belongs to the old key.
			await saveProviderSettings(
				event.locals.db,
				dz.id,
				'yoco',
				{ enabled: bool(f, 'enabled'), ...(sk ? { secrets: { secretKey: sk, webhookSecret: null }, plain: { webhookId: null } } : {}) },
				SECRETS_KEY
			);
			return { message: sk ? 'Yoco key saved — now register the webhook' : 'Yoco settings saved' };
		}),

	yocoWebhook: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const { creds } = await resolveProviders(await getPaymentConfig(event.locals.db, dz.id), SECRETS_KEY);
			if (!creds.yoco) return fail(400, { message: 'Save your Yoco secret key first.' });
			const url = webhookUrl(publicOrigin(event.url, APP_ORIGIN), 'yoco', dz.id);
			if (!url.startsWith('https://') && !paymentsContext().mockUrl) return fail(400, { message: `Yoco needs a public https:// address. This server is ${url.split('/api/')[0]}.` });
			try {
				const hook = await PROVIDERS.yoco.registerWebhook!(paymentsContext(), creds.yoco, url);
				await saveProviderSettings(event.locals.db, dz.id, 'yoco', { secrets: { webhookSecret: hook.secret }, plain: { webhookId: hook.id } }, SECRETS_KEY);
			} catch (e) {
				return fail(400, { message: e instanceof Error ? e.message : 'Yoco webhook registration failed' });
			}
			return { message: 'Yoco webhook registered — Yoco payments are ready' };
		}),

	stripe: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const f = await event.request.formData();
			const sk = str(f, 'secretKey');
			const wh = str(f, 'webhookSecret');
			const cfg = await resolveProviders(await getPaymentConfig(event.locals.db, dz.id), SECRETS_KEY);
			if (sk && !keyRe.stripe.test(sk)) return fail(400, { message: 'A Stripe secret key starts with sk_test_, sk_live_ (or a restricted rk_ key).' });
			if (!sk && !cfg.state.stripe.configured) return fail(400, { message: 'Paste your Stripe secret key.' });
			if (wh && !/^whsec_[A-Za-z0-9_]{8,}$/.test(wh)) return fail(400, { message: 'The webhook signing secret starts with whsec_.' });
			const secrets: Record<string, string> = {};
			if (sk) secrets.secretKey = sk;
			if (wh) secrets.webhookSecret = wh;
			await saveProviderSettings(event.locals.db, dz.id, 'stripe', { enabled: bool(f, 'enabled'), secrets }, SECRETS_KEY);
			return { message: 'Stripe details saved' };
		}),

	test: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const id = str(await event.request.formData(), 'provider');
			if (!isOnlineProvider(id)) return fail(400, { message: 'Unknown provider' });
			const { creds } = await resolveProviders(await getPaymentConfig(event.locals.db, dz.id), SECRETS_KEY);
			const c = creds[id];
			if (!c) return fail(400, { message: `Save your ${PROVIDERS[id].label} details first.` });
			const provider = PROVIDERS[id] as PaymentProvider<typeof c>;
			const r = await provider.testConnection!(paymentsContext(), c);
			return r.ok ? { message: r.message } : fail(400, { message: r.message });
		}),

	remove: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const id = str(await event.request.formData(), 'provider');
			if (!isOnlineProvider(id)) return fail(400, { message: 'Unknown provider' });
			if (id === 'payfast') {
				await savePaymentConfig(event.locals.db, dz.id, { payfastMerchantId: null, payfastMerchantKeyEnc: null, payfastPassphraseEnc: null, payfastSandbox: true });
			}
			await clearProviderSettings(event.locals.db, dz.id, id);
			return { message: `${PROVIDERS[id].label} disconnected` };
		})
};
