# Payments

Log-Book is **free for dropzones** and never holds money or takes a cut. Every dropzone connects
**its own** merchant account (PayFast, Paystack, Yoco or Stripe); customers pay the dropzone directly
and the provider pays out to the dropzone's bank account. There is no Stripe Connect / platform
account, no platform fee and no subscription billing.

Pay at manifest (cash / card machine / EFT) keeps working exactly as before, and stays the fallback:
if online payments are off or no provider is ready, bookings and top-ups are "pay at the dropzone".

## What can be paid online

| Flow | Where | Provider record | Effect once confirmed |
| --- | --- | --- | --- |
| Tandem booking deposit or full price | `/dz/[slug]/book` (payment step) | one `payments` row (`tandem_deposit` / `tandem`) covering every jumper in the group (`metadata.allocations`) | each passenger's `amountPaidMinor` (+ `depositMinor` for deposits) and `paymentStatus` updated |
| Tandem balance / deposit later | `/dz/[slug]/book/[conf]` "Pay online now" | as above, one passenger | as above |
| Wallet top-up | `/app/wallet/[slug]` "Add funds" | `wallet_topup` row (same table as pay-at-manifest requests) | wallet credited via `topUp()` (ledger idempotent on provider + tx id) |

"Pay for a slot" online isn't wired: jumpers top up their wallet online and pay slots from it.

## Flow

```
form action ──► createOnline*Payment (pending payments row, id = our reference)
            ──► provider.createCheckout ──► redirect URL (Paystack/Yoco/Stripe)
                                         └► signed form → /pay/:id auto-posts it (PayFast)
customer pays on the provider's page
provider ──► POST /api/payments/:provider/:dropzoneId   (webhook / ITN, verified per dropzone)
            ──► confirmOnlinePayment (idempotent) ──► wallet credit / passenger paid
customer ──► /pay/:id/return ──► (if still pending: server-side status check where the provider has one)
            ──► back to the booking / wallet page with ?payment=:id (shows "Payment received / processing")
customer cancels ──► /pay/:id/cancel ──► payment cancelled (a later genuine success still applies)
customer abandons ──► jumper wallet lists it under "Pending top-ups" with Check (= /pay/:id/return) + Cancel
                  ──► tandem booking page shows "Not confirmed yet" (also without ?payment=, via
                      pendingTandemCheckout) with Check again (= /pay/:id/return) + Cancel payment
                  ──► staff tandem detail (drawer + full page) shows "Online payment not confirmed yet"
                      with the passenger's share, so the counter doesn't take the money twice unknowingly
                  ──► still pending after 48 h: housekeeping marks it cancelled ("expired"; late success still applies)
```

* **Idempotency.** A payment already `succeeded`, or a provider transaction id already recorded
  (`payments_provider_event_unique` on `provider, provider_event_id`), is a no-op. Retried and
  replayed webhooks are safe. Money that arrives after a cancel/fail on our side is still applied.
* **Amount check.** The provider-reported amount and currency must match the payment row (±1 minor
  unit), otherwise nothing is applied and the webhook is rejected (400, provider retries / logs it).
* **Scope.** The webhook URL contains the dropzone id; the payment must belong to that dropzone and
  provider, and the signature is checked with *that* dropzone's secret.
* **Never trusted:** the return redirect itself. On return we only apply what the provider's API
  says (Paystack *Verify Transaction*, Stripe *Retrieve Session*). PayFast and Yoco rely on the
  ITN/webhook (PayFast sends the ITN before redirecting back).

## Code map

| Path | What |
| --- | --- |
| `src/lib/server/payments/types.ts` | `PaymentProvider` interface (`createCheckout`, `handleWebhook`, `verifyPayment?`, `testConnection?`, `refund?`, `registerWebhook?`), `ProviderContext` (injectable fetch + mock URL) |
| `src/lib/server/payments/providers/{payfast,paystack,yoco,stripe}.ts` | one file per provider, plain `fetch` + WebCrypto (runs on Workers and Bun) |
| `src/lib/server/payments/crypto.ts` | MD5 (WebCrypto has none), HMAC-SHA256/512, PHP `urlencode`, constant-time compare |
| `src/lib/server/payments/config.ts` | per-dropzone settings: decrypt for use, mask for the UI, save |
| `src/lib/server/payments/index.ts` | registry, `dropzonePayments()` (which providers are usable), `startTandemCheckout` / `startTopUpCheckout`, `handleProviderWebhook`, `verifyOnReturn` |
| `src/lib/server/domain/online-payments.ts` | pending payment creation + `confirmOnlinePayment` (the only place money effects happen) |
| `src/lib/server/payments/mock.ts`, `scripts/mock-payments.ts` | local mocks of all four providers (see Testing) |
| `src/routes/api/payments/[provider]/[dropzoneId]/+server.ts` | webhook / ITN endpoint |
| `src/routes/pay/[paymentId]/…` | PayFast hand-off form, `return`, `cancel` |
| `src/routes/app/settings/payments/` | Settings → Payments |
| `src/lib/server/csrf.ts` | CSRF guard (see below) |

### Storage

`dropzone_payment_configs.providers` (JSON, migration `0005_payment_providers`) holds per-provider
`{ enabled, …public fields, …secrets as *Enc }`. PayFast keeps its existing columns
(`payfast_merchant_id`, `payfast_merchant_key_enc`, `payfast_passphrase_enc`, `payfast_sandbox`).
Secrets are AES-256-GCM encrypted with `SECRETS_KEY` (`staffadmin/secrets.ts`), never sent to the
browser (the UI shows `••••••1234`), and a key that can't be decrypted (changed `SECRETS_KEY`) marks
the provider "Re-enter keys" instead of failing payments. The old `stripe_*` Connect columns and
`dropzone_subscriptions` are unused.

`payments.provider` now also accepts `paystack` and `yoco` (text column, no DB constraint).

### CSRF

PayFast posts its ITN form-encoded from its servers with no `Origin` header, which SvelteKit's
built-in origin check rejects with 403. The built-in check is therefore switched off
(`csrf.trustedOrigins: ['*']` in `vite.config.ts`) and re-implemented as the first `handle` in
`hooks.server.ts` (`src/lib/server/csrf.ts`, unit-tested): same rule, except paths under
`/api/payments/`, which authenticate every request by provider signature instead.

## Providers

### PayFast (South Africa) — implemented

* Checkout: signed form POST to `https://www.payfast.co.za/eng/process` (sandbox
  `https://sandbox.payfast.co.za/eng/process`). Signature = MD5 of the non-blank fields **in the
  documented order**, values PHP-`urlencode`d, `&passphrase=…` appended.
  [Custom integration](https://developers.payfast.co.za/docs#step_1_form_fields)
* ITN (`notify_url` is sent with every payment, nothing to configure) is verified with all four
  documented checks: signature, source IP (published ranges `197.97.145.144/28`, `41.74.179.192/27`,
  `102.216.36.0/28`, `102.216.36.128/28`, `144.126.193.139`), amount (`amount_gross`), and server
  confirmation via `POST /eng/query/validate` → `VALID`.
  [ITN](https://developers.payfast.co.za/docs#step_4_confirm_payment), [Ports & IPs](https://developers.payfast.co.za/docs#ports-ips)
  The IP check is skipped when the caller looks private/loopback (local mock, or a self-hosted app
  behind a proxy without `ADDRESS_HEADER`) — checks 1, 3 and 4 still apply.
* Test connection: `GET https://api.payfast.co.za/ping` with the API signature (alphabetical,
  passphrase required; `?testing=true` for sandbox). Refund: `POST /refunds/:pf_payment_id`.
  [API](https://developers.payfast.co.za/api)
* **Verified against the real public sandbox** (merchant `10000100` / `46f0cd694581a`, passphrase
  `jt7NOE43FZPn`, from the docs; no account needed): our signed form is accepted (302 to the
  payment page, including a description with `'`, `·` and a return URL with `?x=1&y=2`), a wrong or
  missing passphrase is rejected (400 "signature"), and `testConnection` gets `200 "PayFast API"`
  with the right passphrase / `401` with a wrong one.

### Paystack (ZA, NG, GH, KE) — implemented

* Checkout: `POST https://api.paystack.co/transaction/initialize` (`email`, `amount` in subunits,
  `currency`, `reference` = our payment id, `callback_url`, `metadata.cancel_action`) →
  `authorization_url`. [Transaction API](https://paystack.com/docs/api/transaction/)
* Webhook: `x-paystack-signature` = HMAC-SHA512 (hex) of the raw body with the secret key; we act on
  `charge.success`. The dropzone pastes our URL under Settings → API Keys & Webhooks.
  [Webhooks](https://paystack.com/docs/payments/webhooks/)
* Return: `GET /transaction/verify/:reference`. Test connection: `GET /transaction?perPage=1`.
  Refund: `POST /refund`. [Refund API](https://paystack.com/docs/api/refund/)

### Yoco (South Africa) — implemented

* Checkout: `POST https://payments.yoco.com/api/checkouts` (`amount` cents, `ZAR`, success/cancel/
  failure URLs, `Idempotency-Key`) → `redirectUrl`; we store the checkout id as `provider_ref`.
  Minimum R2.00. [Accepting a payment](https://developer.yoco.com/guides/online-payments/accepting-a-payment),
  [Create checkout](https://developer.yoco.com/api-reference/checkout-api/checkout/create-checkout)
* Webhooks have no dashboard setting: Settings → Payments → **Register webhook** calls
  `POST /api/webhooks` with the dropzone's key and stores the returned `whsec_…` secret (shown only
  once by Yoco). [Register webhook](https://developer.yoco.com/api-reference/checkout-api/webhooks/register-webhook)
* Verification: base64 HMAC-SHA256 of `${webhook-id}.${webhook-timestamp}.${raw body}` keyed with the
  base64-decoded part after `whsec_`; any `v1,` signature in the header may match; timestamps older
  than 3 minutes are rejected; events are matched by `payload.metadata.checkoutId`.
  [Verifying the events](https://developer.yoco.com/guides/online-payments/webhooks/verifying-the-events)
* No status-lookup endpoint is documented for checkouts, so Yoco relies on the webhook.
  Test connection: `GET /api/webhooks`. Refund: `POST /api/checkouts/:id/refund`.
* **Live keys need a verified domain**, and live payments must *come from* that domain (Yoco checks
  the referrer). [Authentication](https://developer.yoco.com/docs/checkout-api/authentication),
  [Sharing checkout links](https://developer.yoco.com/docs/checkout-api/sharing-checkout-links).
  Our flow starts on our own page (form post → 303), so the referrer is our origin — but on the
  hosted service that origin is `log-book.app`, not the dropzone's site. See "Needs the owner".

### Stripe (international) — implemented

* The dropzone's own account and secret key (`sk_…` or a restricted `rk_…`). Checkout Session:
  form-encoded `POST https://api.stripe.com/v1/checkout/sessions` (`mode=payment`, one
  `price_data` line item, `client_reference_id` = our payment id, metadata) → `url`.
  [Create session](https://docs.stripe.com/api/checkout/sessions/create)
* Webhook: `Stripe-Signature: t=…,v1=…` — HMAC-SHA256 hex of `${t}.${raw body}` with the endpoint's
  `whsec_…` secret, any `v1` may match, `v0`/debug entries ignored, 5-minute tolerance. Events:
  `checkout.session.completed` (paid), `…async_payment_succeeded`, `…async_payment_failed`,
  `…expired`. [Verify manually](https://docs.stripe.com/webhooks#verify-manually)
* Return: `GET /v1/checkout/sessions/:id`. Test connection: `GET /v1/balance`. Refund:
  `POST /v1/refunds` (`payment_intent`).
* Stripe does **not** onboard South African businesses (it sends them to Paystack):
  [stripe.com/global](https://stripe.com/global) lists South Africa under its extended network
  linking to `paystack.com/stripe/south-africa`.

### Ozow (South Africa, instant EFT) — not implemented

Ozow's documented hosted-checkout path (Payments API, `HashCheck` SHA-512) is marked **deprecated**
in favour of "One API"; new integrations are told to use One API.
[Hosted Checkout (deprecated)](https://hub.ozow.com/integration-methods/apis/deprecated-integrations/hosted-checkout/),
[Create Payment Request](https://hub.ozow.com/api-reference/payments-api/post-post-payment-request/).
Building on a deprecated path isn't worth it; Ozow is listed in the fee table (its EFT fee is the
lowest) and can be added later as a fifth `PaymentProvider` against One API.

## Fees (South Africa) — checked 12 November 2026

All excl. 15% VAT, standard published pricing (all negotiate at volume).

| Provider | Local cards | Instant EFT / pay-by-bank | International cards | Fixed costs | Source |
| --- | --- | --- | --- | --- | --- |
| **Paystack** | 2.9% + R1 (R1 waived under R10) | 2% (no flat fee) | 3.1% + R1 | none; payouts free | [paystack.com/za/pricing](https://paystack.com/za/pricing) (bot-walled live; read from the [Wayback snapshot of 3 Nov 2025](https://web.archive.org/web/20251103111847/https://paystack.com/za/pricing), same figures quoted by third-party comparisons checked Oct 2026) |
| **Yoco** (Core plan, online) | 2.95% + R2 (<R50k/month), 2.75% + R2 (≥R50k) | not offered via Checkout API | 3.50% + R2 | R199 once-off sign-up if you don't own a Yoco card machine; R0/month | [Yoco Help: plans and fees](https://support.yoco.help/en/articles/270145-all-about-yoco-plans-and-fees) |
| **PayFast** (Aggregation) | 3.2% + R2 | 2% (min R2) | — (not published separately) | R8.70 per payout (R10 incl. VAT) | [payfast.io/fees](https://payfast.io/fees/), [payout fee](https://support.payfast.help/portal/en/kb/articles/how-to-make-a-prepaid-payout-from-your-wallet-22-10-2024) |
| **Ozow** (not integrated) | 2.85% (min R1) | 1.5% (min R1) | 3.5% | none; next-day settlement (VAT treatment not stated) | [ozow.com/pricing](https://ozow.com/pricing) |
| **Stripe** | not available to SA businesses | — | — | — | [stripe.com/global](https://stripe.com/global) |

What a dropzone pays per transaction (card, excl. VAT):

| Amount | Paystack | Yoco <R50k/m | Yoco ≥R50k/m | PayFast | Ozow card | Ozow EFT |
| --- | --- | --- | --- | --- | --- | --- |
| R500 tandem deposit | R15.50 | R16.75 | R15.75 | R18.00 | R14.25 | R7.50 |
| R1 000 wallet top-up | R30.00 | R31.50 | R29.50 | R34.00 | R28.50 | R15.00 |
| R3 400 tandem | R99.60 | R102.30 | R95.50 | R110.80 | R96.90 | R51.00 |

### Recommendation

* **South Africa — default: Paystack.** Cheapest card fee of the providers we integrate at normal
  volumes, 2% EFT, no sign-up or monthly fee, free payouts, instant test keys, and its verify
  endpoint lets us confirm payments even if a webhook is delayed. It's also the route Stripe itself
  sends SA businesses to.
* **Already on Yoco (card machine at manifest)?** Use Yoco: no sign-up fee for card-machine owners,
  online and in-person sales share one payout, and above R50k/month the 2.75% + R2 rate beats
  Paystack for amounts above ~R667 (i.e. most tandem payments). Mind the verified-domain rule.
* **PayFast** is the most expensive (3.2% + R2 plus R8.70 per payout) but offers the most payment
  methods (SnapScan, Zapper, Capitec Pay, Mobicred, store cards); keep it for dropzones that
  already have an account or whose customers ask for those methods.
* **Ozow** would be cheapest for bank payments (1.5%) — worth adding via One API later.
* **International:** Stripe with the dropzone's own account (e.g. UK 1.5% + 20p standard UK cards,
  2.5% + 20p EEA, 3.15% + 20p international + 2% if FX is needed — [stripe.com/gb/pricing](https://stripe.com/gb/pricing);
  US 2.9% + 30¢ — [stripe.com/pricing](https://stripe.com/pricing)). Paystack for Nigeria, Ghana
  and Kenya.

The short version of this table is the helper text on Settings → Payments
(`src/lib/components/payments/fees.ts`).

## Setting up (dropzone owner)

1. Settings → Features → switch on **In-app payments** (and **Wallet** for top-ups).
2. Settings → Payments → connect a provider:
   * **Paystack**: paste the secret key; paste the shown webhook URL in Paystack.
   * **Yoco**: paste the secret key, click **Register webhook**.
   * **PayFast**: merchant id, merchant key, passphrase (same as in PayFast); sandbox switch.
   * **Stripe**: secret key; add the shown endpoint in Stripe with the four events; paste `whsec_…`.
3. **Test connection** proves the keys work. Test keys (`sk_test_…`, PayFast sandbox) never move
   real money; the badge shows "Ready · test mode" until live keys are saved.
4. "Pay at the dropzone" stays available while **Allow payment at manifest** is on.

## Testing (no real money, no real provider calls)

* `bun run test` — signature maths against published vectors (RFC 1321 MD5, RFC 4231 HMAC), PayFast
  field order / param strings / API signature / IP ranges, Yoco + Stripe tolerance and multi-sig
  handling, CSRF guard, and full flows for all four providers against the in-process mocks
  (`flows.test.ts`): checkout → pay on mock → signed webhook → wallet credit / passengers paid,
  replayed webhooks, tampered amounts, forged ITNs, cancel, return-verification without webhook,
  cross-dropzone access, test connection and refunds.
* Browser e2e against the mock server (never the shared :4318 suite):

  ```sh
  bun run build:bun
  PORT=4372 APP_ORIGIN=http://localhost:4371 bun scripts/mock-payments.ts &
  PORT=4371 ORIGIN=http://localhost:4371 DATABASE_PATH=data/payments.db \
    PAYMENTS_MOCK_URL=http://localhost:4372 SECRETS_KEY=dev bun build/server.js &
  PAYMENTS_E2E=1 bunx playwright test -c <copy of playwright.config with baseURL :4371, no webServer> payments
  ```

  `e2e/payments.spec.ts` connects PayFast/Paystack/Yoco in the UI, books a tandem and pays the
  deposit through mock PayFast (signed form → ITN → validate), pays the balance with mock Paystack,
  tops up a wallet with Paystack and cancels a Yoco top-up. `GET :4372/__deliveries` lists the
  webhooks the mock sent and our responses.
* The same spec also passed against the Cloudflare build (`bun run build:cf`, local D1,
  `wrangler dev --var PAYMENTS_MOCK_URL:http://localhost:4373 --var SECRETS_KEY:…` with a second mock
  pointed at the worker) — MD5/HMAC/AES all run on workerd.
* `PAYMENTS_MOCK_URL` points every provider call at the mock. **Never set it in production.**

## Needs the owner

* **Yoco on the hosted service:** live Yoco keys only work from a domain verified in the
  dropzone's Yoco profile, and payments must originate from it. On `log-book.app` the dropzone
  would have to get `log-book.app` approved by Yoco — unclear whether Yoco allows that. Self-hosted
  dropzones on their own domain are fine. Ask Yoco, or treat Yoco as self-hosted-only.
* Set `SECRETS_KEY` in production before any dropzone saves keys (already in the deploy secrets).
* Webhook URLs use `APP_ORIGIN` when set, otherwise the request origin — make sure `APP_ORIGIN` is
  the public https origin.
* Refunds exist at provider level (`provider.refund`) and are tested against the mocks, but there's
  no refund button yet (reversing a wallet credit / tandem payment needs a product decision).
