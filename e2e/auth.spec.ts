import { expect, test } from '@playwright/test';

test('landing renders', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Run the dropzone');
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\.png$/);
	await expect(page.getByRole('link', { name: 'Self-host it' })).toHaveAttribute('href', '/self-host');
	await page.screenshot({ path: `test-results/landing-${test.info().project.name}.png`, fullPage: false });
});

test('signup → dashboard → logout → login → dashboard', async ({ page }) => {
	const email = `e2e-${Date.now()}-${test.info().project.name}@example.com`;
	const password = 'blue-skies-123';

	await page.goto('/app');
	await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp/);

	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Erin Exit');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Create account' }).click();

	await expect(page).toHaveURL(/\/app$/);
	await expect(page.getByTestId('dashboard-heading')).toContainText('Erin');
	// No dropzone yet = no known timezone, so no time-of-day guess.
	await expect(page.getByText('Welcome,')).toBeVisible();

	// Create a dropzone so the staff navigation + switcher are populated.
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Skydive E2E ${test.info().project.name} ${Date.now()}`);
	// Timezone is a picker; a forged unknown zone is refused (it used to 500 the new DZ's dashboard).
	const tz = page.locator('select[name=timezone]');
	await expect(tz.locator('option[value="Africa/Johannesburg"]')).toHaveCount(1);
	await tz.evaluate((s: HTMLSelectElement) => {
		s.add(new Option('Mars/Olympus', 'Mars/Olympus'));
		s.value = 'Mars/Olympus';
		s.dispatchEvent(new Event('change', { bubbles: true }));
	});
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page.getByRole('alert')).toContainText('Unknown timezone');
	await expect(page).toHaveURL(/\/app\/dropzones\/new/);
	await tz.selectOption('Africa/Johannesburg');
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	// A brand-new dropzone gets the owner's setup checklist; every step links to its settings page.
	await expect(page.getByTestId('setup-checklist')).toContainText('0 of 7 done');
	await expect(page.getByTestId('setup-checklist').getByRole('link', { name: /Add your aircraft/ })).toHaveAttribute('href', '/app/aircraft');
	await page.screenshot({ path: `test-results/dashboard-${test.info().project.name}.png`, fullPage: true });

	// Logout (POST form on /logout)
	await page.goto('/logout');
	await page.getByRole('button', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/\/login$/);

	// Wrong password
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('alert')).toContainText('Incorrect email or password');

	// Correct password
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await expect(page.getByTestId('dashboard-heading')).toBeVisible();
});
