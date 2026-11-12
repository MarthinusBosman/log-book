import { expect, test, type Page } from '@playwright/test';

/** Jumper area main flow on a fresh database: own DZ → check in → logbook → gear → profile → teams → wallet. */
async function signup(page: Page, name: string) {
	const email = `jumper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	return email;
}

test('jumper: check in, log + edit a jump, export, gear, profile, team, wallet', async ({ page }) => {
	const project = test.info().project.name;
	await signup(page, 'Jo Jumper');
	await expect(page.getByTestId('jumper-dashboard')).toBeVisible();

	// A dropzone to jump at (the creator is owner + can check in like anyone else)
	const dzName = `Skydive Jumper E2E ${project} ${Date.now()}`;
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(dzName);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// Directory + detail
	await page.goto('/app/dropzones');
	await page.getByTestId('dz-search').fill(dzName);
	await page.getByTestId('dz-search').press('Enter');
	await page.getByRole('link', { name: dzName }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(dzName);
	await page.getByTestId('follow').click();
	await expect(page.getByTestId('follow')).toContainText('Following');

	// Check in
	await page.getByTestId('dz-checkin').click();
	await expect(page).toHaveURL(/\/app\/check-in/);
	await page.getByLabel('Exit weight (kg)').fill('88');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toContainText(dzName);

	// Logbook: add a jump (number prefilled), then edit it
	await page.goto('/app/logbook');
	await page.getByTestId('log-jump').first().click();
	await expect(page).toHaveURL(/\/app\/logbook\/new/);
	await expect(page.getByLabel('Jump #')).toHaveValue('1');
	await page.getByLabel('Aircraft').fill('Cessna 182');
	await page.getByLabel('Altitude (ft)').fill('10000');
	await page.getByLabel('Freefall (sec)').fill('0:45');
	await page.getByText('Freeflying', { exact: true }).click();
	await page.getByLabel('Description').fill('First freefly jump');
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]+$/);
	await expect(page.getByText('Jump has been added')).toBeVisible();
	await page.getByLabel('Altitude (ft)').fill('12000');
	await page.getByTestId('save-jump').click();
	await expect(page.getByText('Jump info updated')).toBeVisible();

	// Sign-off link + QR
	await page.getByTestId('create-sign-link').click();
	await expect(page.getByTestId('sign-link').getByRole('img', { name: 'Sign jump' })).toBeVisible();

	// List + CSV export
	await page.goto('/app/logbook');
	await expect(page.getByTestId('jump-card')).toHaveCount(1);
	await expect(page.getByTestId('jump-card')).toContainText('12 000 ft');
	const csv = await page.request.get('/app/logbook/export.csv');
	expect(csv.headers()['content-type']).toContain('text/csv');
	const body = await csv.text();
	expect(body).toContain('Jump #,Date');
	expect(body).toContain('First freefly jump');

	// Gear: add a rig, wing loading computed live
	await page.goto('/app/my-gear/new');
	await page.getByLabel('Container make & model *').fill('Javelin Odyssey');
	await page.getByLabel('Main canopy *').fill('Sabre3');
	await page.getByLabel('Size (sq ft)').first().fill('170');
	await page.getByLabel('Exit weight (kg)').fill('88');
	await expect(page.getByTestId('wing-loading')).toContainText('1.14');
	await page.getByLabel('Reserve canopy *').fill('PD 160');
	await page.getByLabel('Last repack date *').fill('2026-01-01');
	await page.getByTestId('save-rig').click();
	await expect(page).toHaveURL(/\/app\/my-gear\/[0-9a-f-]+/);
	await page.goto('/app/my-gear');
	await expect(page.getByTestId('rig-card')).toHaveCount(1);

	// Profile credentials
	await page.goto('/app/profile?tab=credentials');
	await page.getByLabel('Skydive association').selectOption('pasa');
	await page.getByLabel('Association number').fill('12345');
	await page.getByLabel('Membership expiry').fill('2030-01-01');
	await page.getByLabel('Licence number').fill('C-1');
	await page.getByRole('button', { name: 'Save credentials' }).click();
	await expect(page.getByText('Credentials updated successfully')).toBeVisible();

	// Team
	await page.goto('/app/team');
	await page.getByTestId('new-team').click();
	await page.getByLabel('Team name').fill('Sunset 4-way');
	await page.getByRole('button', { name: 'Create team' }).click();
	await expect(page).toHaveURL(/\/app\/team\/[0-9a-f-]+/);
	await expect(page.getByTestId('team-members')).toContainText('Jo Jumper');

	// Wallet: the new DZ has wallets off by default → friendly notice
	await page.goto('/app/wallet');
	await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeVisible();

	// Notifications
	await page.goto('/app/notifications');
	await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
	await page.screenshot({ path: `test-results/jumper-${project}.png`, fullPage: false });
});
