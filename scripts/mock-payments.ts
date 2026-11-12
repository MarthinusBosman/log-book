/**
 * Local stand-in for PayFast, Paystack, Yoco and Stripe (src/lib/server/payments/mock.ts) for
 * browser demos and e2e tests. No real provider is contacted and no money moves.
 *
 *   PORT=4372 APP_ORIGIN=http://localhost:4371 bun scripts/mock-payments.ts
 *   # then run the app with PAYMENTS_MOCK_URL=http://localhost:4372
 *
 * Credentials the mock accepts: PayFast 10000100 / 46f0cd694581a / passphrase jt7NOE43FZPn;
 * Paystack/Yoco/Stripe any `sk_test_…` key (not `sk_test_bad…`); Stripe webhook signing secret
 * whsec_mock_log_book_payments_secret. GET /__deliveries lists the webhooks it sent.
 */
import { createMockProviders } from '../src/lib/server/payments/mock.ts';

const port = Number(process.env.PORT ?? 4372);
const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:4371';
const mock = createMockProviders({ appOrigin });

Bun.serve({
	port,
	fetch: (req) => (new URL(req.url).pathname === '/__deliveries' ? Response.json(mock.deliveries) : mock.handle(req))
});
console.log(`mock payment providers on http://localhost:${port} → webhooks to ${appOrigin}`);
