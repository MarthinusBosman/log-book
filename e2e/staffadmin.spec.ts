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
	// A new dropzone has no rigs: no "Gear due" card.
	await expect(page.getByTestId('gear-attention')).toHaveCount(0);

	// Features: enable the jumper wallet.
	await go(page, '/app/settings/features');
	const wallet = page.getByRole('switch', { name: /Jumper wallet/ });
	if (!(await wallet.isChecked())) await page.getByText('Jumper wallet', { exact: true }).click();
	await page.getByRole('button', { name: 'Save features' }).click();
	await expect(page.getByText('Features saved')).toBeVisible();

	// Aircraft
	await go(page, '/app/aircraft');
	await page.getByRole('link', { name: 'Add plane' }).first().click();
	await expect(page).toHaveURL(/\/app\/aircraft\?new=1$/);
	await dialog(page).getByLabel('Plane name').fill('Caravan');
	// a dialog with form controls adds no extra tab stop for its scroll area
	await expect(dialog(page).getByRole('region')).toHaveCount(0);
	await dialog(page).getByLabel('Pax (jumper slots)').fill('14');
	await dialog(page).getByRole('button', { name: 'Add to fleet' }).click();
	await expect(page.getByText('Caravan added to the fleet')).toBeVisible();
	await expect(page.getByTestId('no-js-outcome')).toHaveCount(0); // with JS: toast only
	await expect(page).toHaveURL(/\/app\/aircraft$/);
	// Without JS (or before hydration) Add plane is a link that opens the form, and it posts.
	{
		const noJs = await page.context().browser()!.newContext({
			javaScriptEnabled: false,
			baseURL: new URL(page.url()).origin,
			storageState: await page.context().storageState()
		});
		const plain = await noJs.newPage();
		await plain.goto('/app/aircraft');
		await plain.getByRole('link', { name: 'Add plane' }).first().click();
		await expect(plain).toHaveURL(/\/app\/aircraft\?new=1$/);
		// Without JS the action's answer (normally a toast) shows on the page: a refusal…
		await dialog(plain).getByLabel('Plane name').fill('   ');
		await dialog(plain).getByLabel('Pax (jumper slots)').fill('4');
		await dialog(plain).getByRole('button', { name: 'Add to fleet' }).click();
		await expect(plain.getByTestId('no-js-outcome').getByRole('alert')).toHaveText('Enter the plane name.');
		await plain.goto('/app/aircraft?new=1');
		await dialog(plain).getByLabel('Plane name').fill('Cessna 182');
		await dialog(plain).getByLabel('Pax (jumper slots)').fill('4');
		await dialog(plain).getByRole('button', { name: 'Add to fleet' }).click();
		await expect(plain.getByText('Cessna 182', { exact: true })).toBeVisible();
		// …and a success.
		await expect(plain.getByTestId('no-js-outcome').getByRole('status')).toHaveText('Cessna 182 added to the fleet');
		// Tandems: New tandem is a link too, and keeps the board's day.
		await plain.goto('/app/tandems?day=2026-12-01');
		await plain.getByRole('link', { name: 'New tandem' }).first().click();
		await expect(plain).toHaveURL(/\/app\/tandems\?day=2026-12-01&new=1$/);
		await expect(dialog(plain).getByRole('heading', { name: 'Create tandem passenger' })).toBeVisible();
		// Members: Invite opens the form.
		await plain.goto('/app/settings/members');
		await plain.getByRole('link', { name: 'Invite' }).click();
		await expect(dialog(plain).getByLabel('Email')).toBeVisible();
		await noJs.close();
	}
	// With JS the New tandem dialog follows the URL: Escape drops ?new.
	await go(page, '/app/tandems?day=2026-12-01');
	await page.getByTestId('new-tandem').click();
	await expect(page).toHaveURL(/\/app\/tandems\?day=2026-12-01&new=1$/);
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/app\/tandems\?day=2026-12-01$/);

	// Price list
	await go(page, '/app/pricelist');
	// A new dropzone's prices are 0: the fields are empty (placeholder only), ready to type into.
	const sportSlot = page.getByLabel('Sport slot', { exact: true });
	await expect(sportSlot).toHaveValue('');
	await expect(sportSlot).toHaveAttribute('placeholder', '0.00');
	await sportSlot.fill('450');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.getByText('Price list updated')).toBeVisible();
	await page.reload();
	await expect(sportSlot).toHaveValue('450.00');
	await expect(page.getByLabel('Gear rental', { exact: true })).toHaveValue('');

	// Gear
	await go(page, '/app/gear');
	await page.getByRole('link', { name: 'Add rig' }).first().click();
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

	// Dashboard: the overdue student rig shows up in the "Gear due" card and deep-links the filter.
	await go(page, '/app');
	const gearCard = page.getByTestId('gear-attention');
	await expect(gearCard.getByRole('heading', { name: 'Gear due' })).toBeVisible();
	await expect(gearCard.getByText('1 grounded')).toBeVisible();
	await expect(gearCard.getByText(/jumpers’ rigs? due/)).toHaveCount(0);
	await gearCard.getByRole('link', { name: /1 DZ rig needs attention/ }).click();
	await expect(page).toHaveURL(/\/app\/gear\?show=attention$/);
	await expect(page.getByLabel('Filter rigs')).toHaveValue('attention');
	await expect(page.getByRole('cell', { name: /Student 1/ })).toBeVisible();
	// Tab and filter changes stay in the URL, so a reload returns to the same view.
	await page.getByRole('tab', { name: /Jumpers.? gear/ }).click();
	await expect(page).toHaveURL(/\/app\/gear\?show=attention&tab=members$/);
	await page.reload();
	await expect(page.getByRole('tab', { name: /Jumpers.? gear/ })).toHaveAttribute('aria-selected', 'true');
	// …and so does back from another page (a shallow URL would be lost on back).
	await go(page, '/app');
	await page.goBack();
	await expect(page).toHaveURL(/\/app\/gear\?show=attention&tab=members$/);
	await expect(page.getByRole('tab', { name: /Jumpers.? gear/ })).toHaveAttribute('aria-selected', 'true');
	await page.getByRole('tab', { name: /DZ rigs/ }).click();
	await page.getByLabel('Filter rigs').selectOption('');
	await expect(page).toHaveURL(/\/app\/gear$/);
	// ?new=1 opens the Add rig form; closing it drops the param.
	await go(page, '/app/gear?new=1');
	await expect(dialog(page).getByLabel('Name / number')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/app\/gear$/);
	// The server renders a URL-opened dialog, so ?new=1 is upgraded to a real modal on hydration…
	await go(page, '/app/gear?new=1');
	expect(await dialog(page).evaluate((d) => d.matches(':modal'))).toBe(true);
	await dialog(page).getByRole('button', { name: 'Close' }).click();
	await expect(page).toHaveURL(/\/app\/gear$/);
	// …and without JS (or before hydration) Add rig is a link that opens the form, Close works
	// natively, and the form posts.
	const noJs = await page.context().browser()!.newContext({
		javaScriptEnabled: false,
		baseURL: new URL(page.url()).origin,
		storageState: await page.context().storageState()
	});
	const plain = await noJs.newPage();
	await plain.goto('/app/gear');
	await plain.getByRole('link', { name: 'Add rig' }).first().click();
	await expect(plain).toHaveURL(/\/app\/gear\?new=1$/);
	await dialog(plain).getByRole('button', { name: 'Close' }).click();
	await expect(dialog(plain)).toHaveCount(0);
	await plain.goto('/app/gear?new=1');
	await dialog(plain).getByLabel('Name / number').fill('Student 2');
	await dialog(plain).getByLabel('Last reserve repack').fill('2026-11-01');
	await dialog(plain).getByRole('button', { name: 'Add to register' }).click();
	await expect(plain.getByRole('cell', { name: /Student 2/ })).toBeVisible();
	await noJs.close();

	// Waivers: Add section / Edit are links (?new=1 / ?edit=<id>) that work before hydration and
	// without JS; no-JS posts come back on the same tab.
	const sport = page.getByTestId('builder-sport');
	await go(page, '/app/waivers?tab=sport');
	await page.getByTestId('add-section-sport').click();
	await expect(page).toHaveURL(/\/app\/waivers\?tab=sport&new=1$/);
	await sport.getByLabel('Heading').fill('Assumption of risk');
	await sport.getByLabel('Content').fill('Skydiving is dangerous.');
	await sport.getByRole('button', { name: 'Add section', exact: true }).click();
	await expect(sport.getByRole('heading', { name: 'Assumption of risk' })).toBeVisible();
	await expect(page).toHaveURL(/\/app\/waivers\?tab=sport$/);
	await sport.getByRole('link', { name: 'Edit Assumption of risk' }).click();
	await expect(page).toHaveURL(/\/app\/waivers\?tab=sport&edit=/);
	await sport.getByLabel('Heading').fill('Risk');
	await sport.getByRole('button', { name: 'Save section' }).click();
	await expect(sport.getByRole('heading', { name: 'Risk', exact: true })).toBeVisible();
	await expect(page).toHaveURL(/\/app\/waivers\?tab=sport$/);
	// Delete asks first: the ✕ is a ?delete=<id> link showing an inline confirm; Cancel keeps it.
	await sport.getByRole('link', { name: 'Delete Risk' }).click();
	await expect(page).toHaveURL(/\/app\/waivers\?tab=sport&delete=/);
	await expect(sport.getByTestId('confirm-delete')).toContainText('Delete “Risk”?');
	await sport.getByTestId('confirm-delete').getByRole('link', { name: 'Cancel' }).click();
	await expect(sport.getByTestId('confirm-delete')).toHaveCount(0);
	await expect(page).toHaveURL(/\/app\/waivers\?tab=sport$/);
	await expect(sport.getByRole('heading', { name: 'Risk', exact: true })).toBeVisible();
	// Preview is a ?preview=1 link too: opens in place, closing clears the param.
	await page.getByTestId('preview-sport').click();
	await expect(page).toHaveURL(/\/app\/waivers\?tab=sport&preview=1$/);
	await expect(dialog(page).getByRole('heading', { name: '1. Risk' })).toBeVisible();
	// Read-only body: the scroll area itself is the next tab stop after Close, so the
	// keyboard can scroll a long waiver (axe scrollable-region-focusable).
	const previewBody = dialog(page).getByRole('region');
	await expect(previewBody).toHaveAttribute('tabindex', '0');
	await dialog(page).getByRole('button', { name: 'Close' }).focus();
	await page.keyboard.press('Tab');
	await expect(previewBody).toBeFocused();
	await dialog(page).getByRole('button', { name: 'Close' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await expect(page).toHaveURL(/\/app\/waivers\?tab=sport$/);
	const noJsW = await page.context().browser()!.newContext({
		javaScriptEnabled: false,
		baseURL: new URL(page.url()).origin,
		storageState: await page.context().storageState()
	});
	const pw = await noJsW.newPage();
	const sportW = pw.getByTestId('builder-sport');
	await pw.goto('/app/waivers?tab=sport');
	await sportW.getByRole('link', { name: 'Add section' }).click();
	await sportW.getByLabel('Heading').fill('Medical');
	await sportW.getByLabel('Content').fill('I am fit to jump.');
	await sportW.getByRole('button', { name: 'Add section', exact: true }).click();
	await expect(sportW.getByRole('heading', { name: 'Medical' })).toBeVisible();
	await sportW.getByRole('link', { name: 'Edit Medical' }).click();
	await expect(sportW.getByLabel('Heading')).toHaveValue('Medical');
	await sportW.getByRole('link', { name: 'Cancel' }).click();
	await expect(sportW.getByLabel('Heading')).toHaveCount(0);
	await sportW.getByRole('button', { name: 'Move Medical up' }).click();
	await expect(sportW.getByTestId('section').first()).toContainText('Medical');
	// Without JS, Delete still asks before removing anything.
	await sportW.getByRole('link', { name: 'Add section' }).click();
	await sportW.getByLabel('Heading').fill('Temporary');
	await sportW.getByLabel('Content').fill('Remove me.');
	await sportW.getByRole('button', { name: 'Add section', exact: true }).click();
	await sportW.getByRole('link', { name: 'Delete Temporary' }).click();
	await expect(sportW.getByRole('heading', { name: 'Temporary' })).toBeVisible();
	await sportW.getByTestId('confirm-delete').getByRole('button', { name: 'Delete section' }).click();
	await expect(pw.getByText('Section removed')).toBeVisible();
	await expect(sportW.getByRole('heading', { name: 'Temporary' })).toHaveCount(0);
	await sportW.getByRole('link', { name: 'Preview' }).click();
	await expect(dialog(pw).getByText('I am fit to jump.')).toBeVisible();
	await noJsW.close();

	// Members: invite someone new with the packer (staff) role.
	await go(page, '/app/settings/members');
	await page.getByRole('link', { name: 'Invite' }).click();
	await expect(page).toHaveURL(/\/app\/settings\/members\?new=1$/);
	await dialog(page).getByLabel('Email').fill(memberEmail);
	await dialog(page).getByLabel('Name').fill('Mia Member');
	await dialog(page).getByRole('button', { name: 'Send invite' }).click();
	await expect(page.getByText('Mia Member').first()).toBeVisible();
	// Mia hasn't set a password yet: marked, and her invite link can be sent again.
	const miaRow = page.locator('main li').filter({ hasText: 'Mia Member' });
	await expect(miaRow.getByText('Not signed up')).toBeVisible();
	await expect(page.locator('main li').filter({ hasText: 'Olga Owner' }).getByText('Not signed up')).toHaveCount(0);
	await expect(page.getByText('1 not signed up yet')).toBeVisible();
	await miaRow.getByRole('button', { name: 'Resend invite to Mia Member' }).click();
	await expect(page.getByText(`Invite sent again to ${memberEmail}`)).toBeVisible();
	// The member search survives a reload (?q=).
	await page.getByLabel('Search members').fill('mia');
	await expect(page).toHaveURL(/\/app\/settings\/members\?q=mia$/);
	await page.reload();
	await expect(page.getByLabel('Search members')).toHaveValue('mia');
	await expect(page.getByText('Mia Member').first()).toBeVisible();
	await expect(page.locator('main').getByText('Olga Owner')).toHaveCount(0);
	// Roles / Remove are links (?edit= / ?remove=): open in place, the URL follows, and
	// closing or saving drops the param again.
	await page.getByRole('link', { name: 'Edit roles for Mia Member' }).click();
	await expect(page).toHaveURL(/\/app\/settings\/members\?q=mia&edit=[^&]+$/);
	await expect(dialog(page).getByRole('heading', { name: 'Roles · Mia Member' })).toBeVisible();
	await dialog(page).getByRole('checkbox', { name: /Coach/ }).check();
	await dialog(page).getByRole('button', { name: 'Save roles' }).click();
	await expect(page.getByText('Roles updated for Mia Member')).toBeVisible();
	await expect(page).toHaveURL(/\/app\/settings\/members\?q=mia$/);
	await page.getByRole('link', { name: 'Remove Mia Member' }).click();
	await expect(page).toHaveURL(/\/app\/settings\/members\?q=mia&remove=[^&]+$/);
	await expect(dialog(page).getByRole('heading', { name: 'Remove member?' })).toBeVisible();
	await dialog(page).getByRole('link', { name: 'Cancel' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await expect(page).toHaveURL(/\/app\/settings\/members\?q=mia$/);
	{
		// Without JS (or before hydration) the same links open the dialogs and the forms post.
		const noJsM = await page.context().browser()!.newContext({
			javaScriptEnabled: false,
			baseURL: new URL(page.url()).origin,
			storageState: await page.context().storageState()
		});
		const pm = await noJsM.newPage();
		await pm.goto('/app/settings/members');
		await pm.getByRole('link', { name: 'Edit roles for Mia Member' }).click();
		await expect(dialog(pm).getByRole('checkbox', { name: /Coach/ })).toBeChecked();
		await dialog(pm).getByRole('checkbox', { name: /Rigger/ }).check();
		await dialog(pm).getByRole('button', { name: 'Save roles' }).click();
		await expect(pm.getByTestId('no-js-outcome').getByRole('status')).toHaveText('Roles updated for Mia Member');
		await expect(pm.locator('main li').filter({ hasText: 'Mia Member' }).getByText('Rigger')).toBeVisible();
		await pm.getByRole('link', { name: 'Remove Mia Member' }).click();
		await expect(dialog(pm).getByRole('heading', { name: 'Remove member?' })).toBeVisible();
		await dialog(pm).getByRole('link', { name: 'Cancel' }).click();
		await expect(dialog(pm)).toHaveCount(0);
		await noJsM.close();
	}

	// Jumpers → detail → wallet top-up (reason required).
	await go(page, '/app/jumpers');
	// Search text and filter chip stay in the URL, so back from a jumper returns to the same list.
	await page.getByLabel('Search', { exact: true }).fill('Mia');
	const chipBar = page.getByRole('navigation', { name: 'Filter jumpers' });
	await chipBar.getByRole('link', { name: /^Staff/ }).click();
	await expect(page).toHaveURL(/\/app\/jumpers\?q=Mia&show=staff$/);
	await page.getByRole('link', { name: /Mia Member/ }).click();
	await expect(page.getByRole('heading', { name: 'Mia Member' })).toBeVisible();
	await page.goBack();
	await expect(page.getByLabel('Search', { exact: true })).toHaveValue('Mia');
	await expect(chipBar.getByRole('link', { name: /^Staff/ })).toHaveAttribute('aria-current', 'true');
	await expect(page.locator('main').getByRole('link', { name: /Olga Owner/ })).toHaveCount(0);
	// Without JS (or before hydration) the chips are plain links and the search keeps the chip.
	{
		const noJs = await page.context().browser()!.newContext({
			javaScriptEnabled: false,
			baseURL: new URL(page.url()).origin,
			storageState: await page.context().storageState()
		});
		const plain = await noJs.newPage();
		await plain.goto('/app/jumpers');
		const chips = plain.getByRole('navigation', { name: 'Filter jumpers' });
		await expect(chips.getByRole('link', { name: /^All/ })).toHaveAttribute('aria-current', 'true');
		await chips.getByRole('link', { name: /^Staff/ }).click();
		await expect(plain).toHaveURL(/\/app\/jumpers\?show=staff$/);
		await expect(chips.getByRole('link', { name: /^Staff/ })).toHaveAttribute('aria-current', 'true');
		await expect(plain.locator('main').getByRole('link', { name: /Olga Owner/ })).toBeVisible();
		await plain.getByLabel('Search', { exact: true }).fill('Mia');
		await plain.getByLabel('Search', { exact: true }).press('Enter');
		await expect(plain).toHaveURL(/\/app\/jumpers\?q=Mia&show=staff$/);
		await expect(plain.locator('main').getByRole('link', { name: /Mia Member/ })).toBeVisible();
		await expect(plain.locator('main').getByRole('link', { name: /Olga Owner/ })).toHaveCount(0);
		await chips.getByRole('link', { name: /^All/ }).click();
		await expect(plain).toHaveURL(/\/app\/jumpers\?q=Mia$/);
		await noJs.close();
	}
	await page.getByRole('link', { name: /Mia Member/ }).click();
	await expect(page.getByRole('heading', { name: 'Mia Member' })).toBeVisible();
	await page.getByLabel('Amount').fill('300');
	await page.getByLabel('Reason').fill('Cash at manifest');
	await page.getByRole('button', { name: 'Record' }).click();
	await expect(page.getByText('Funds added to the wallet')).toBeVisible();
	await expect(page.getByRole('cell', { name: /Cash at manifest/ })).toBeVisible();
	// The method reads as a word, not a raw id.
	await expect(page.getByRole('cell', { name: /Top-up · Cash/ })).toBeVisible();

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
	await expect(page.getByRole('list', { name: 'Top-ups by method' }).getByText('Cash', { exact: true }).first()).toBeVisible();
	const label = (await row.locator('span[title]').boundingBox())!;
	const bar = (await row.locator('svg').boundingBox())!;
	expect(bar.y).toBeGreaterThanOrEqual(label.y + label.height - 1);
	expect(bar.width).toBeGreaterThan(label.width);
	await page.setViewportSize({ width: 1280, height: 900 });
	await go(page, '/app/reports/print');
	await expect(page.getByRole('heading', { name: 'Jump Report' })).toBeVisible();
});
