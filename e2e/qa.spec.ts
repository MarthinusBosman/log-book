import { expect, test, type Page } from '@playwright/test';

/** Whole-app coherence: role-aware navigation, owner onboarding, waiver prompts, in-shell errors. */
async function signup(page: Page, name: string) {
	const email = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
}

async function logout(page: Page) {
	await page.goto('/logout');
	await page.getByRole('button', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/\/login$/);
}

test('owner onboarding → jumper sees only jumper nav, is prompted for the waiver, staff pages say no access', async ({ page }) => {
	const mobile = test.info().project.name === 'mobile';
	const dzName = `Skydive QA ${test.info().project.name} ${Date.now()}`;

	// Owner: new dropzone shows the setup checklist and the full staff navigation
	await signup(page, 'Olga Owner');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(dzName);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await expect(page.getByTestId('setup-checklist')).toContainText('0 of 7 done');
	await expect(page.locator('a[href="/app/pricelist"]').first()).toBeAttached();

	// Sport waiver: activate + one section → the "write your waivers" step ticks off
	await page.goto('/app/waivers?tab=sport');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('add-section-sport').click();
	await page.getByLabel('Heading').fill('Assumption of risk');
	await page.getByLabel('Content').fill('Skydiving is dangerous and I accept the risks.');
	await page.getByRole('button', { name: 'Add section', exact: true }).last().click();
	await expect(page.getByTestId('builder-sport').getByRole('heading', { name: 'Assumption of risk' }).first()).toBeVisible();
	await page.getByTestId('toggle-sport').click();
	await expect(page.getByTestId('toggle-sport')).toHaveText('Switch off');
	await page.goto('/app');
	await expect(page.getByTestId('setup-checklist')).toContainText('1 of 7 done');
	await logout(page);

	// Jumper: no staff items anywhere in the navigation
	await signup(page, 'Jamie Jumper');
	await expect(page.locator('a[href="/app/pricelist"]')).toHaveCount(0);
	await expect(page.locator('a[href="/app/settings"]')).toHaveCount(0);
	if (mobile) {
		const tabs = page.getByRole('navigation', { name: 'Quick' });
		await expect(tabs.getByRole('link', { name: 'Check-in' })).toBeVisible();
		await expect(tabs.getByRole('link', { name: 'Logbook' })).toBeVisible();
		await expect(tabs.getByRole('button', { name: 'More' })).toBeVisible();
	}

	// The dropzone page asks for the waiver; after checking in, so does the dashboard
	await page.goto('/app/dropzones');
	await page.getByTestId('dz-search').fill(dzName);
	await page.getByTestId('dz-search').press('Enter');
	await page.getByRole('link', { name: dzName }).click();
	await expect(page.getByTestId('dz-waiver')).toBeVisible();
	await page.getByTestId('dz-checkin').click();
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toContainText(dzName);
	await page.goto('/app');
	const alert = page.getByRole('link', { name: new RegExp(`Sign the ${dzName} waiver`) });
	await expect(alert).toBeVisible();
	await expect(alert).toHaveAttribute('href', /\/app\/waivers\/sign\//);

	// Staff pages and unknown URLs render inside the app shell
	await page.goto('/app/pricelist');
	await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
	await page.goto('/app/definitely/not/here');
	await expect(page.getByRole('heading', { name: 'Off the landing area' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
});
