import { expect, test } from '@playwright/test';

// The whole flow works without JavaScript (plain form posts).
test.use({ javaScriptEnabled: false });

test('delete account: confirm with password, signed out, email free again', async ({ page }) => {
	const email = `delete-${Date.now()}-${test.info().project.name}@example.com`;
	const password = 'blue-skies-123';

	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Dee Leet');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);

	await page.goto('/app/profile?tab=security');
	await page.getByTestId('delete-account-link').click();
	await expect(page).toHaveURL(/\/app\/profile\/delete$/);
	const box = page.getByTestId('delete-account');
	await expect(box.getByRole('heading', { name: 'What is deleted' })).toBeVisible();
	await expect(box.getByRole('heading', { name: 'What your dropzones keep' })).toBeVisible();

	// Wrong password: refused, still signed in.
	const form = page.getByTestId('delete-form');
	await form.getByLabel('Your password').fill('not-my-password');
	await form.getByRole('checkbox').check();
	await form.getByRole('button', { name: 'Delete my account' }).click();
	await expect(page.getByTestId('delete-form').getByRole('alert')).toContainText('password is incorrect');

	await page.getByTestId('delete-form').getByLabel('Your password').fill(password);
	await page.getByTestId('delete-form').getByRole('checkbox').check();
	await page.getByTestId('delete-form').getByRole('button', { name: 'Delete my account' }).click();
	await expect(page).toHaveURL(/\/\?deleted=1$/);
	await expect(page.getByTestId('account-deleted')).toBeVisible();

	// Signed out; the old credentials no longer work.
	await page.goto('/app');
	await expect(page).toHaveURL(/\/login/);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: /log in/i }).click();
	await expect(page).toHaveURL(/\/login/);

	// The address can be used for a new account.
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Dee Again');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
});
