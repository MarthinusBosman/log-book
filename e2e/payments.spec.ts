import { expect, test, type Page } from '@playwright/test';

/**
 * Online payments end to end against the LOCAL provider mocks (scripts/mock-payments.ts) — never a
 * real provider. Needs the app started with PAYMENTS_MOCK_URL and the mock pointed back at the app:
 *
 *   PORT=4372 APP_ORIGIN=http://localhost:4371 bun scripts/mock-payments.ts
 *   PORT=4371 ORIGIN=http://localhost:4371 PAYMENTS_MOCK_URL=http://localhost:4372 bun build/server.js
 *   PAYMENTS_E2E=1 bunx playwright test -c <config with baseURL http://localhost:4371> payments
 *
 * Skipped in the shared suite (no mock there).
 */
test.skip(!process.env.PAYMENTS_E2E, 'needs scripts/mock-payments.ts + PAYMENTS_MOCK_URL (set PAYMENTS_E2E=1)');

async function clickVisible(page: Page, testIds: string[]) {
	const sel = testIds.map((id) => `[data-testid="${id}"]:visible`).join(', ');
	await page.locator(sel).first().click();
}

async function toast(page: Page, text: RegExp | string) {
	await expect(page.locator('[role=status], [data-sonner-toast], .toast, [aria-live]').filter({ hasText: text }).first()).toBeVisible();
}

test('payments: connect providers → tandem deposit via PayFast ITN → wallet top-up via Paystack webhook', async ({ page }) => {
	const stamp = `${test.info().project.name}-${Date.now()}`;
	const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

	// Owner + dropzone
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Penny Payments');
	await page.getByLabel('Email').fill(`payments-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Pay DZ ${stamp}`);
	await page.locator('select[name=country]').selectOption('ZA');
	await page.locator('select[name=currency]').selectOption('ZAR');
	await page.getByLabel('Timezone').selectOption('Africa/Johannesburg');
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// Prices, a booking slot, and switch on payments + wallet.
	await page.goto('/app/pricelist');
	await page.waitForLoadState('networkidle');
	await page.locator('input[name=tandem_slot]').first().fill('3200');
	await page.locator('input[name=tandem_deposit]').first().fill('500');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await toast(page, 'Price list updated');
	await page.goto('/app/tandems/slots');
	await page.getByLabel('Date').fill(tomorrow);
	await page.getByLabel('Time').fill('10:00');
	await page.getByLabel('Places').fill('3');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(page.locator('[data-testid="slot-day"]').first()).toContainText('10:00');
	await page.goto('/app/settings/features');
	await page.waitForLoadState('networkidle');
	await page.locator('label:has(input[name=paymentsOn])').click();
	await page.locator('label:has(input[name=walletEnabled])').click();
	await page.getByRole('button', { name: 'Save features' }).click();
	await toast(page, /saved/i);

	// Settings → Payments: fee table, connect PayFast (sandbox creds the mock knows) + Paystack + Yoco.
	await page.goto('/app/settings/payments');
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('fees')).toContainText('Paystack');
	const pf = page.getByTestId('card-payfast');
	await pf.getByLabel('Merchant ID').fill('10000100');
	await pf.getByLabel('Merchant key').fill('46f0cd694581a');
	await pf.getByLabel('Passphrase').fill('jt7NOE43FZPn');
	await pf.getByTestId('save-payfast').click();
	await toast(page, 'PayFast details saved');
	await expect(pf).toContainText('Ready · test mode');
	await pf.getByTestId('test-payfast').click();
	await toast(page, /PayFast API answered/);
	await expect(pf.getByTestId('webhook-payfast')).toContainText('/api/payments/payfast/');

	const ps = page.getByTestId('card-paystack');
	await ps.getByLabel('Secret key').fill('sk_test_mockpaystack123456');
	await ps.getByTestId('save-paystack').click();
	await toast(page, 'Paystack details saved');
	await expect(ps).toContainText('Ready · test mode');
	await ps.getByTestId('test-paystack').click();
	await toast(page, /accepted the test secret key/);
	// Secrets never come back to the browser in plain text.
	expect(await page.content()).not.toContain('sk_test_mockpaystack123456');

	const yo = page.getByTestId('card-yoco');
	await yo.getByLabel('Secret key').fill('sk_test_mockyoco1234567');
	await yo.getByTestId('save-yoco').click();
	await toast(page, /register the webhook/);
	await expect(yo).toContainText('Almost ready');
	await yo.getByTestId('yoco-register').click();
	await toast(page, 'Yoco webhook registered');
	await expect(yo).toContainText('Ready · test mode');

	await page.goto('/app/tandems');
	const href = await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href');
	const slug = href!.split('/')[2];

	// Public booking, pay the deposit online with PayFast.
	await page.goto(`/dz/${slug}/book`);
	await page.locator(`[data-date="${tomorrow}"]`).click();
	await page.locator('[data-time="10:00"]').click();
	await clickVisible(page, ['next', 'next-mobile']);
	await page.locator('input[name=j0_name]').fill('Pat Passenger');
	await page.locator('input[name=j0_email]').fill('pat@example.com');
	await page.locator('input[name=j0_phone]').fill('0820001111');
	await page.locator('input[name=j0_dob]').fill('1990-05-05');
	await page.locator('input[name=j0_weightKg]').fill('72');
	await page.locator('input[name=j0_emergencyName]').fill('Sam Contact');
	await page.locator('input[name=j0_emergencyPhone]').fill('0820002222');
	await clickVisible(page, ['next', 'next-mobile']);
	await page.getByTestId('provider-payfast').check();
	await page.getByTestId('pay-deposit').check();
	await page.getByTestId('terms').check();
	await clickVisible(page, ['confirm', 'confirm-mobile']);
	// /pay/:id auto-posts the signed form to (mock) PayFast, which checks the signature.
	await expect(page.getByTestId('mock-amount')).toHaveText('R 500.00');
	await page.getByTestId('mock-pay').click();
	await expect(page).toHaveURL(new RegExp(`/dz/${slug}/book/[A-Z0-9]{4}-[A-Z0-9]{4}\\?payment=`));
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'succeeded');
	await expect(page.getByTestId('payment-notice')).toContainText(/500[.,]00 via PayFast/);

	// Pay the balance with Paystack from the confirmation page.
	await expect(page.getByTestId('pay-online')).toBeVisible();
	await page.getByTestId('pay-with-paystack').click();
	await expect(page.getByTestId('mock-amount')).toContainText('2700.00');
	await page.getByTestId('mock-pay').click();
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'succeeded');
	await expect(page.getByTestId('pay-online')).toHaveCount(0);

	// Group of two: the online checkout is cancelled, then the lead pays both deposits from
	// the confirmation page ("Whole group" is the default).
	await page.goto(`/dz/${slug}/book`);
	await page.locator(`[data-date="${tomorrow}"]`).click();
	await page.locator('[data-time="10:00"]').click();
	await page.getByRole('button', { name: 'More jumpers' }).click();
	await clickVisible(page, ['next', 'next-mobile']);
	for (const [i, name] of ['Lee Lead', 'Max Mate'].entries()) {
		await page.locator(`input[name=j${i}_name]`).fill(name);
		await page.locator(`input[name=j${i}_email]`).fill(`j${i}@example.com`);
		await page.locator(`input[name=j${i}_phone]`).fill('0820001111');
		await page.locator(`input[name=j${i}_dob]`).fill('1991-06-06');
		await page.locator(`input[name=j${i}_weightKg]`).fill('70');
	}
	await page.locator('input[name=j0_emergencyName]').fill('Sam Contact');
	await page.locator('input[name=j0_emergencyPhone]').fill('0820002222');
	await clickVisible(page, ['next', 'next-mobile']);
	await page.getByTestId('provider-payfast').check();
	await page.getByTestId('pay-deposit').check();
	await page.getByTestId('terms').check();
	await clickVisible(page, ['confirm', 'confirm-mobile']);
	await expect(page.getByTestId('mock-amount')).toHaveText('R 1000.00');
	await page.getByTestId('mock-cancel').click();
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'cancelled');
	await expect(page.getByTestId('group-total')).toContainText(/6[\s ]?400/);
	await expect(page.getByTestId('who-group')).toBeChecked();
	await page.getByTestId('pay-with-paystack').click();
	await expect(page.getByTestId('mock-amount')).toContainText('1000.00');
	await page.getByTestId('mock-pay').click();
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'succeeded');
	await expect(page).toHaveURL(/[?&]g=/);
	await expect(page.getByTestId('group-total')).toContainText(/5[\s ]?400/);

	// Abandoned group balance checkout: the customer comes back via the booking link (no
	// ?payment=), sees "Not confirmed yet", checks with the provider (still unpaid), then cancels.
	const bookingUrl = new URL(page.url());
	bookingUrl.searchParams.delete('payment');
	await page.getByTestId('pay-with-paystack').click();
	await expect(page.getByTestId('mock-amount')).toContainText('5400.00');
	await page.goto(bookingUrl.href);
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'pending');
	await expect(page.getByTestId('payment-notice')).toContainText('Not confirmed yet');
	await page.getByTestId('payment-check').click();
	await expect(page).toHaveURL(/[?&]payment=/);
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'pending');
	await page.getByTestId('payment-cancel').click();
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'cancelled');
	await expect(page).toHaveURL(/[?&]g=/);
	await page.goto(bookingUrl.href);
	await expect(page.getByTestId('payment-notice')).toHaveCount(0);
	await expect(page.getByTestId('group-total')).toContainText(/5[\s ]?400/);

	// Wallet top-up with Paystack (webhook credits the wallet).
	await page.goto(`/app/wallet/${slug}`);
	await page.waitForLoadState('networkidle');
	await page.locator('#amount').fill('750');
	await page.getByTestId('topup-provider-paystack').check();
	await page.getByTestId('topup-submit').click();
	await expect(page.getByTestId('mock-amount')).toContainText('750.00');
	await page.getByTestId('mock-pay').click();
	await expect(page).toHaveURL(new RegExp(`/app/wallet/${slug}\\?payment=`));
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'succeeded');
	await expect(page.getByTestId('wallet-balance')).toContainText('750');

	// Cancelled Yoco top-up: nothing credited.
	await page.locator('#amount').fill('100');
	await page.getByTestId('topup-provider-yoco').check();
	await page.getByTestId('topup-submit').click();
	await page.getByTestId('mock-cancel').click();
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'cancelled');
	await expect(page.getByTestId('wallet-balance')).toContainText('750');

	// Abandoned Paystack checkout (customer comes back without paying): listed as pending with a
	// Check button that asks the provider (still unpaid → "Not confirmed yet"), then cancelled.
	await page.locator('#amount').fill('200');
	await page.getByTestId('topup-provider-paystack').check();
	await page.getByTestId('topup-submit').click();
	await expect(page.getByTestId('mock-amount')).toContainText('200.00');
	await page.goto(`/app/wallet/${slug}`);
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('pending-topups')).toContainText('not confirmed by Paystack yet');
	await page.getByTestId('topup-check').click();
	await expect(page.getByTestId('payment-notice')).toHaveAttribute('data-status', 'pending');
	await expect(page.getByTestId('payment-notice')).toContainText('Not confirmed yet');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('pending-topups').getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByTestId('pending-topups')).toHaveCount(0);
	await expect(page.getByTestId('wallet-balance')).toContainText('750');

	// Owner sees the payments in Settings → Payments.
	await page.goto('/app/settings/payments');
	await expect(page.getByTestId('recent-payments').locator('li')).toHaveCount(8);
});
