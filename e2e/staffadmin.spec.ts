import { expect, test, type Page } from '@playwright/test';

/**
 * Staff admin main flow on a fresh DB: owner signs up, creates a DZ, turns the wallet on,
 * adds a plane, sets a price, registers a rig, invites a member, tops up their wallet,
 * and checks reports + CSV. Desktop only (dense staff UI).
 */
test.skip(({ isMobile }) => isMobile, 'staff back-office flow runs on desktop');

const dialog = (page: Page) => page.locator('dialog[open]');
/** Navigate and wait for hydration (buttons that open dialogs need client JS). */
async function go(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
}

test('owner runs the back office', async ({ page }) => {
	test.setTimeout(120_000);
	const stamp = Date.now();
	const ownerEmail = `sa-owner-${stamp}@example.com`;
	const memberEmail = `sa-member-${stamp}@example.com`;

	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Olga Owner');
	await page.getByLabel('Email').fill(ownerEmail);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);

	await go(page, '/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Staff Admin DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// Features: enable the jumper wallet.
	await go(page, '/app/settings/features');
	const wallet = page.getByRole('switch', { name: /Jumper wallet/ });
	if (!(await wallet.isChecked())) await page.getByText('Jumper wallet', { exact: true }).click();
	await page.getByRole('button', { name: 'Save features' }).click();
	await expect(page.getByText('Features saved')).toBeVisible();

	// Aircraft
	await go(page, '/app/aircraft');
	await page.getByRole('button', { name: 'Add plane' }).first().click();
	await dialog(page).getByLabel('Plane name').fill('Caravan');
	await dialog(page).getByLabel('Pax (jumper slots)').fill('14');
	await dialog(page).getByRole('button', { name: 'Add to fleet' }).click();
	await expect(page.getByText('Caravan added to the fleet')).toBeVisible();

	// Price list
	await go(page, '/app/pricelist');
	await page.getByLabel('Sport slot', { exact: true }).fill('450');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.getByText('Price list updated')).toBeVisible();

	// Gear
	await go(page, '/app/gear');
	await page.getByRole('button', { name: 'Add rig' }).first().click();
	await dialog(page).getByLabel('Name / number').fill('Student 1');
	await dialog(page).getByLabel('Last reserve repack').fill('2026-01-01');
	await dialog(page).getByRole('button', { name: 'Add to register' }).click();
	await expect(page.getByRole('cell', { name: /Student 1/ })).toBeVisible();
	// On a phone each rig is a card (no sideways scroll): the row's actions are on screen.
	await page.setViewportSize({ width: 390, height: 844 });
	const rigTable = (await page.locator('table').first().boundingBox())!;
	expect(rigTable.x + rigTable.width).toBeLessThanOrEqual(390);
	const service = (await page.getByRole('row', { name: /Student 1/ }).getByRole('button', { name: 'Service' }).boundingBox())!;
	expect(service.x + service.width).toBeLessThanOrEqual(390);
	await expect(page.getByRole('cell', { name: /Repack due/ }).first()).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 900 });

	// Members: invite someone new with the packer (staff) role.
	await go(page, '/app/settings/members');
	await page.getByRole('button', { name: 'Invite' }).click();
	await dialog(page).getByLabel('Email').fill(memberEmail);
	await dialog(page).getByLabel('Name').fill('Mia Member');
	await dialog(page).getByRole('button', { name: 'Send invite' }).click();
	await expect(page.getByText('Mia Member').first()).toBeVisible();

	// Jumpers → detail → wallet top-up (reason required).
	await go(page, '/app/jumpers');
	await page.getByRole('link', { name: /Mia Member/ }).click();
	await expect(page.getByRole('heading', { name: 'Mia Member' })).toBeVisible();
	await page.getByLabel('Amount').fill('300');
	await page.getByLabel('Reason').fill('Cash at manifest');
	await page.getByRole('button', { name: 'Record' }).click();
	await expect(page.getByText('Funds added to the wallet')).toBeVisible();
	await expect(page.getByRole('cell', { name: /Cash at manifest/ })).toBeVisible();

	// Staff + reports render; CSV export works.
	await go(page, '/app/staff');
	await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	const staffTable = (await page.locator('table').first().boundingBox())!;
	expect(staffTable.x + staffTable.width).toBeLessThanOrEqual(390);
	await page.setViewportSize({ width: 1280, height: 900 });
	await go(page, '/app/reports');
	await expect(page.getByText('Wallet top-ups vs charges')).toBeVisible();
	const csv = await page.request.get('/app/reports/export?kind=wallet');
	expect(csv.status()).toBe(200);
	expect(await csv.text()).toContain('Top-ups');
	// On a phone the bar lists stack the bar under its label so names aren't cut short.
	await page.setViewportSize({ width: 390, height: 844 });
	const row = page.getByRole('list', { name: 'Top-ups by method' }).getByRole('listitem').first();
	const label = (await row.locator('span[title]').boundingBox())!;
	const bar = (await row.locator('svg').boundingBox())!;
	expect(bar.y).toBeGreaterThanOrEqual(label.y + label.height - 1);
	expect(bar.width).toBeGreaterThan(label.width);
	await page.setViewportSize({ width: 1280, height: 900 });
	await go(page, '/app/reports/print');
	await expect(page.getByRole('heading', { name: 'Jump Report' })).toBeVisible();
});
