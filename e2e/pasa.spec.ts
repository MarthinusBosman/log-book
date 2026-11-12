import { expect, test } from '@playwright/test';

/**
 * "Verify with PASA" card. Only exercises paths that never reach para.co.za (input validation,
 * the manual-entry fallback copy); lookups against PASA itself are covered by unit tests with
 * synthetic fixture responses (src/lib/server/memberships).
 */
test('profile: PASA card validates the number without calling PASA', async ({ page }) => {
	const email = `pasa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Pat Pasa');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);

	await page.goto('/app/profile?tab=credentials');
	await page.waitForLoadState('networkidle');
	const card = page.getByTestId('pasa-card');
	await expect(card).toHaveAttribute('data-state', 'none');
	await expect(card.getByRole('heading', { name: 'Verify with PASA' })).toBeVisible();
	await expect(card.getByRole('link', { name: 'members directory' })).toHaveAttribute('href', 'https://www.para.co.za/Members');

	await card.getByLabel('PASA number').fill('not-a-number');
	await card.getByRole('button', { name: 'Look up' }).click();
	await expect(card.getByTestId('form-error')).toContainText('digits only');
	// Still on the credentials tab, manual form untouched and editable.
	await expect(page).toHaveURL(/tab=credentials/);
	await expect(page.getByLabel('Association number')).toBeEditable();
});
