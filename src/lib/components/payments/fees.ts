/**
 * Published South African online-payment fees (checked 2026-11-12, excl. VAT). Shown as helper
 * text on Settings → Payments; the full comparison with sources is in docs/PAYMENTS.md.
 * Log-Book itself is free and never takes a cut — these are the provider's own fees.
 */
export const FEES_CHECKED = '12 Nov 2026';

export type FeeRow = { provider: string; card: string; eft: string; other: string; integrated: boolean };

export const SA_FEES: FeeRow[] = [
	{ provider: 'Paystack', card: '2.9% + R1', eft: '2%', other: 'No sign-up fee, free payouts', integrated: true },
	{ provider: 'Yoco', card: '2.95% + R2', eft: '—', other: 'R199 once-off sign-up (waived with a Yoco card machine)', integrated: true },
	{ provider: 'PayFast', card: '3.2% + R2', eft: '2% (min R2)', other: 'R8.70 per payout; most payment methods', integrated: true },
	{ provider: 'Ozow', card: '2.85%', eft: '1.5%', other: 'Not connected in Log-Book yet', integrated: false }
];

export const FEE_RECOMMENDATION =
	'Cheapest sensible default in South Africa: Paystack (lowest card fee of the connected providers, free payouts, no sign-up fee). Already have a Yoco card machine? Use Yoco so online and in-person sales share one payout. Outside South Africa use Stripe with your own account.';
