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

test('self-manifest stops at boarding: the jumper can no longer join or leave', async ({ page }) => {
	const project = test.info().project.name;
	await signup(page, 'Bo Boarding');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Boarding E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// Two open loads
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-BRD');
	await dialog.getByLabel('Slots (pax)').fill('6');
	await dialog.getByLabel('Weight limit (kg)').fill('600');
	await dialog.getByLabel('Number of loads').fill('2');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	await expect(page.locator('[data-testid=load-card][data-load-number="2"]')).toBeVisible();

	// Check in and join load 1 from the phone view
	await page.goto('/app/check-in');
	await page.getByLabel('Exit weight (kg)').fill('80');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toBeVisible();
	await page.waitForLoadState('networkidle');
	const load1 = page.locator('[data-testid=load-card][data-load="1"]');
	const load2Id = new URLSearchParams(
		(await page.locator('[data-testid=load-card][data-load="2"]').getByTestId('join-solo').getAttribute('href'))!.slice(1)
	).get('join')!;
	await load1.getByTestId('join-solo').click();
	await load1.getByRole('button', { name: 'Join this load' }).click();
	await expect(load1.getByText('You’re on this load')).toBeVisible();

	// Manifest: 20 min call → boarding on both loads
	await page.goto('/app/manifest');
	for (const n of ['1', '2']) {
		const card = page.locator(`[data-testid=load-card][data-load-number="${n}"]`);
		for (const status of ['called', 'boarding']) {
			await card.getByTestId('next-step').click();
			await expect(card).toHaveAttribute('data-status', status);
		}
	}

	await page.goto('/app/check-in');
	await expect(load1.getByTestId('boarding-note')).toBeVisible();
	await expect(load1.getByRole('button', { name: 'Leave' })).toHaveCount(0);
	const load2 = page.locator('[data-testid=load-card][data-load="2"]');
	await expect(load2.getByRole('button', { name: 'Boarding · ask manifest' })).toBeDisabled();
	await expect(load2.getByTestId('join-solo')).toHaveCount(0);

	// The server refuses it too (no-JS / stale page)
	const origin = new URL(page.url()).origin;
	const res = await page.request.post('/app/check-in?/join', {
		form: { loadId: load2Id, jumpType: 'belly' },
		headers: { origin, accept: 'application/json', 'x-sveltekit-action': 'true' }
	});
	expect(await res.text()).toContain('is boarding: ask manifest');
	await page.reload();
	await expect(load2.getByText('You’re on this load')).toHaveCount(0);
});

async function addLicence(page: Page, licence: string) {
	await page.goto('/app/profile?tab=credentials');
	await page.getByLabel('Skydive association').selectOption('pasa');
	await page.getByLabel('Association number').fill('54321');
	await page.getByLabel('Membership expiry').fill('2030-01-01');
	await page.getByLabel('Licence number').fill(licence);
	await page.getByRole('button', { name: 'Save credentials' }).click();
	await expect(page.getByText('Credentials updated successfully')).toBeVisible();
}

test('sign-off: a licensed jumper signs with a drawn signature; a second signer cannot replace it', async ({ page, browser }) => {
	await signup(page, 'Sam Student');
	await page.goto('/app/logbook/new');
	await page.getByLabel('Location').fill('Skydive Test Field');
	await page.getByLabel('Aircraft').fill('Cessna 182');
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]+$/);
	const jumpUrl = page.url();
	await page.getByTestId('create-sign-link').click();
	const link = await page.getByLabel('Sign-off link').inputValue();

	// The instructor signs, drawing on the pad
	const ctxA = await browser.newContext({ baseURL: new URL(link).origin });
	const a = await ctxA.newPage();
	await signup(a, 'Ina Instructor');
	await addLicence(a, 'D-777');
	await a.goto(link);
	await a.waitForLoadState('networkidle');
	const pad = (await a.locator('canvas').boundingBox())!;
	await a.mouse.move(pad.x + 20, pad.y + pad.height / 2);
	await a.mouse.down();
	for (let i = 1; i <= 12; i++) await a.mouse.move(pad.x + 20 + i * 15, pad.y + pad.height / 2 + (i % 2 ? -15 : 15));
	await a.mouse.up();
	await a.getByLabel(/I witnessed or supervised/).check();
	await a.getByTestId('sign-now').click();
	await expect(a.getByTestId('sign-done')).toContainText('Jump has been signed');

	// Someone else with the same link can't overwrite it (page and a forced POST)
	const ctxB = await browser.newContext({ baseURL: new URL(link).origin });
	const b = await ctxB.newPage();
	await signup(b, 'Other Jumper');
	await addLicence(b, 'C-888');
	await b.goto(link);
	await expect(b.getByTestId('sign-done')).toContainText('Already signed by Ina Instructor');
	const forced = await b.request.post(link, { form: { confirm: '1' }, headers: { accept: 'application/json', origin: new URL(link).origin } });
	expect(await forced.text()).toContain('already been signed by Ina Instructor');

	// The jumper sees the signer and the drawn signature
	await page.goto(jumpUrl);
	await expect(page.getByTestId('signed')).toContainText('Signed by Ina Instructor');
	await expect(page.getByTestId('signed')).toContainText('Licence D-777');
	const img = page.getByTestId('signature-img');
	await expect(img).toHaveAttribute('alt', 'Signature of Ina Instructor');
	await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
	// …which only the jumper and the signer may load
	const src = (await img.getAttribute('src'))!;
	expect((await a.request.get(src)).status()).toBe(200);
	expect((await b.request.get(src)).status()).toBe(404);
	await ctxA.close();
	await ctxB.close();
});

test('wallet top-up amounts: a minus sign is refused and "1,000" means a thousand', async ({ page }) => {
	await signup(page, 'Wally Wallet');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Wallet DZ ${test.info().project.name} ${Date.now()}`);
	await page.locator('select[name=country]').selectOption('ZA');
	await page.locator('select[name=currency]').selectOption('ZAR');
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/settings/features');
	await page.waitForLoadState('networkidle');
	await page.locator('label:has(input[name=walletEnabled])').click();
	await page.getByRole('button', { name: 'Save features' }).click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: /saved/i }).first()).toBeVisible();

	await page.goto('/app/wallet');
	await page.locator('main a[href^="/app/wallet/"]').first().click();
	await page.waitForLoadState('networkidle');
	const form = page.getByTestId('topup-form');
	await page.locator('#amount').fill('-5');
	await page.getByTestId('topup-submit').click();
	await expect(form).toContainText('Enter a valid amount');
	await expect(page.getByTestId('pending-topups')).toHaveCount(0);

	await page.locator('#amount').fill('1,000');
	await page.getByTestId('topup-submit').click();
	await expect(page.getByTestId('pending-topups')).toContainText(/R\s?1\s?000,00/);
	await page.locator('#amount').fill('150,50');
	await page.getByTestId('topup-submit').click();
	await expect(page.getByTestId('pending-topups')).toContainText(/R\s?150,50/);
});
