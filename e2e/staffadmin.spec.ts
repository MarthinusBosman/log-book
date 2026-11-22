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
	// With JS Edit opens in place, the URL follows (reload keeps it) and Escape drops it.
	await page.getByRole('link', { name: 'Edit Caravan' }).click();
	await expect(dialog(page).getByRole('heading', { name: 'Edit Caravan' })).toBeVisible();
	await expect(page).toHaveURL(/\/app\/aircraft\?edit=[\w-]+$/);
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(dialog(page).getByRole('heading', { name: 'Edit Caravan' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/app\/aircraft$/);
	await page.getByRole('link', { name: 'Delete Caravan' }).click();
	await expect(dialog(page).getByText('Delete Caravan? Past loads keep the plane name')).toBeVisible();
	await dialog(page).getByRole('link', { name: 'Cancel' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
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
		// A plane's Edit / Delete are links (?edit=<id> / ?delete=<id>) that render the dialog open.
		await plain.getByRole('link', { name: 'Edit Cessna 182' }).click();
		await expect(plain).toHaveURL(/\/app\/aircraft\?edit=[\w-]+$/);
		await expect(dialog(plain).getByRole('heading', { name: 'Edit Cessna 182' })).toBeVisible();
		await dialog(plain).getByLabel('Pax (jumper slots)').fill('5');
		await dialog(plain).getByRole('button', { name: 'Save plane' }).click();
		await expect(plain.getByTestId('no-js-outcome').getByRole('status')).toHaveText('Plane info updated');
		await plain.getByRole('link', { name: 'Delete Cessna 182' }).click();
		await expect(plain).toHaveURL(/\/app\/aircraft\?delete=[\w-]+$/);
		await dialog(plain).getByRole('link', { name: 'Cancel' }).click();
		await expect(plain).toHaveURL(/\/app\/aircraft$/);
		await expect(plain.locator('dialog[open]')).toHaveCount(0);
		await plain.getByRole('link', { name: 'Delete Cessna 182' }).click();
		await dialog(plain).getByRole('button', { name: 'Delete' }).click();
		await expect(plain.getByTestId('no-js-outcome').getByRole('status')).toHaveText('Cessna 182 deleted. Past loads keep their plane name.');
		await expect(plain.getByRole('link', { name: 'Edit Cessna 182' })).toHaveCount(0);
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
	// A typo far down the page: the failed save focuses (and explains) the bad field.
	const handcam = page.getByLabel('Handcam', { exact: true });
	await sportSlot.fill('1,450');
	await handcam.fill('abc');
	await sportSlot.focus();
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.getByText('Fix 1 price before saving.')).toBeVisible();
	await expect(handcam).toBeFocused();
	await expect(handcam).toHaveAttribute('aria-invalid', 'true');
	await expect(handcam).toHaveAccessibleDescription('Enter an amount like 450 or 450.00');
	await handcam.fill('');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.getByText('Price list updated')).toBeVisible();
	// The fields show the saved amounts straight away, as a reload would.
	await expect(sportSlot).toHaveValue('1 450');
	await expect(handcam).not.toHaveAttribute('aria-invalid', 'true');
	await page.reload();
	await expect(sportSlot).toHaveValue('1 450');
	await expect(page.getByLabel('Gear rental', { exact: true })).toHaveValue('');

	// Gear
	await go(page, '/app/gear');
	await page.getByRole('link', { name: 'Add rig' }).first().click();
	await dialog(page).getByLabel('Name / number').fill('Student 1');
	await dialog(page).getByLabel('Last reserve repack').fill('2026-01-01');
	await dialog(page).getByRole('button', { name: 'Add to register' }).click();
	await expect(page.getByRole('cell', { name: /^Student 1/ })).toBeVisible();
	// On a phone each rig is a card (no sideways scroll): the row's actions are on screen.
	await page.setViewportSize({ width: 390, height: 844 });
	const rigTable = (await page.locator('table').first().boundingBox())!;
	expect(rigTable.x + rigTable.width).toBeLessThanOrEqual(390);
	const service = (await page.getByRole('row', { name: /Student 1/ }).getByRole('link', { name: 'Service Student 1' }).boundingBox())!;
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
	const rigChips = page.getByRole('navigation', { name: 'Filter rigs' });
	await expect(rigChips.getByRole('link', { name: /Needs attention/ })).toHaveAttribute('aria-current', 'true');
	await expect(page.getByRole('cell', { name: /^Student 1/ })).toBeVisible();
	// Tab and filter changes stay in the URL, so a reload returns to the same view.
	await page.getByRole('tab', { name: /Jumpers.? gear/ }).click();
	await expect(page).toHaveURL(/\/app\/gear\?show=attention&tab=members$/);
	await page.reload();
	await expect(page.getByRole('tab', { name: /Jumpers.? gear/ })).toHaveAttribute('aria-selected', 'true');
	// The "Due soon / All rigs" switch on that tab follows the URL too.
	const memberSwitch = page.getByRole('navigation', { name: "Jumpers' gear shown" });
	await memberSwitch.getByRole('link', { name: /All rigs/ }).click();
	await expect(page).toHaveURL(/\/app\/gear\?show=attention&tab=members&all=1$/);
	await expect(memberSwitch.getByRole('link', { name: /All rigs/ })).toHaveAttribute('aria-current', 'true');
	await memberSwitch.getByRole('link', { name: /Due soon/ }).click();
	await expect(page).toHaveURL(/\/app\/gear\?show=attention&tab=members$/);
	// …and so does back from another page (a shallow URL would be lost on back).
	await go(page, '/app');
	await page.goBack();
	await expect(page).toHaveURL(/\/app\/gear\?show=attention&tab=members$/);
	await expect(page.getByRole('tab', { name: /Jumpers.? gear/ })).toHaveAttribute('aria-selected', 'true');
	await page.getByRole('tab', { name: /DZ rigs/ }).click();
	// With JS the chips switch the filter in place (no navigation) and the URL follows.
	await rigChips.getByRole('link', { name: /All rigs/ }).click();
	await expect(page).toHaveURL(/\/app\/gear$/);
	await expect(rigChips.getByRole('link', { name: /All rigs/ })).toHaveAttribute('aria-current', 'true');
	await rigChips.getByRole('link', { name: /Grounded/ }).click();
	await expect(page).toHaveURL(/\/app\/gear\?show=grounded$/);
	await expect(page.getByRole('cell', { name: /^Student 1/ })).toBeVisible();
	await rigChips.getByRole('link', { name: /All rigs/ }).click();
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
	await expect(plain.getByRole('cell', { name: /^Student 2/ })).toBeVisible();
	// The rig filter chips are links too, and a native search keeps the active chip.
	const plainChips = plain.getByRole('navigation', { name: 'Filter rigs' });
	await plainChips.getByRole('link', { name: /Available/ }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?show=available$/);
	await expect(plain.getByRole('cell', { name: /^Student 2/ })).toBeVisible();
	await expect(plain.getByRole('cell', { name: /^Student 1/ })).toHaveCount(0);
	await plain.getByRole('searchbox').fill('Student');
	await plain.getByRole('searchbox').press('Enter');
	await expect(plain).toHaveURL(/\/app\/gear\?q=Student&show=available$/);
	await expect(plainChips.getByRole('link', { name: /Available/ })).toHaveAttribute('aria-current', 'true');
	await plainChips.getByRole('link', { name: /All rigs/ }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?q=Student$/);
	await expect(plain.getByRole('cell', { name: /^Student 1/ })).toBeVisible();
	// The tabs and the members' "All rigs" switch are links as well.
	await plain.getByRole('tab', { name: /Jumpers.? gear/ }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?q=Student&tab=members$/);
	await expect(plain.getByRole('tab', { name: /Jumpers.? gear/ })).toHaveAttribute('aria-selected', 'true');
	const plainSwitch = plain.getByRole('navigation', { name: "Jumpers' gear shown" });
	await plainSwitch.getByRole('link', { name: /All rigs/ }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?q=Student&tab=members&all=1$/);
	await expect(plainSwitch.getByRole('link', { name: /All rigs/ })).toHaveAttribute('aria-current', 'true');
	await plain.getByRole('tab', { name: /DZ rigs/ }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?q=Student$/);
	await expect(plain.getByRole('cell', { name: /^Student 1/ })).toBeVisible();
	// A row's Service / Edit / Delete are links (?service= / ?edit= / ?delete=) the server opens.
	// The AAD next-due field follows the "Work done" choice with CSS, so it shows without JS.
	await plain.getByRole('link', { name: 'Service Student 2' }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?q=Student&service=[\w-]+$/);
	await expect(dialog(plain).getByRole('heading', { name: 'Record service' })).toBeVisible();
	await expect(dialog(plain).getByLabel('Next AAD service due')).toBeHidden();
	await dialog(plain).getByLabel('Work done').selectOption('aad_service');
	await expect(dialog(plain).getByLabel('Next AAD service due')).toBeVisible();
	await dialog(plain).getByLabel('Next AAD service due').fill('2027-11-01');
	await dialog(plain).getByRole('button', { name: 'Save' }).click();
	await expect(plain.getByTestId('no-js-outcome')).toContainText('Service recorded for Student 2');
	await expect(plain.getByRole('row', { name: /Student 2/ }).getByText('No date')).toHaveCount(0);
	await plain.getByRole('link', { name: 'Edit Student 2' }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?edit=[\w-]+$/);
	await expect(dialog(plain).getByLabel('Name / number')).toHaveValue('Student 2');
	await dialog(plain).getByRole('link', { name: 'Delete this rig' }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?delete=[\w-]+$/);
	await dialog(plain).getByRole('link', { name: 'Cancel' }).click();
	await expect(plain).toHaveURL(/\/app\/gear\?edit=[\w-]+$/);
	await dialog(plain).getByRole('link', { name: 'Delete this rig' }).click();
	await dialog(plain).getByRole('button', { name: 'Delete' }).click();
	await expect(plain.getByTestId('no-js-outcome')).toContainText('Student 2 removed');
	await expect(plain.getByRole('cell', { name: /^Student 2/ })).toHaveCount(0);
	await noJs.close();
	// With JS the same links open in place, the URL follows (reload keeps the dialog) and closing
	// drops the param.
	await go(page, '/app/gear');
	await page.getByRole('link', { name: 'Edit Student 1' }).click();
	await expect(page).toHaveURL(/\/app\/gear\?edit=[\w-]+$/);
	await expect(dialog(page).getByLabel('Name / number')).toHaveValue('Student 1');
	await page.reload();
	await expect(dialog(page).getByLabel('Name / number')).toHaveValue('Student 1');
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/app\/gear$/);
	// Saving keeps the rigger's place in the list: a same-page action doesn't follow the action's
	// URL (Kit 3 would navigate to /app/gear without ?service=, which scrolls to the top).
	const viewport = page.viewportSize();
	await page.setViewportSize({ width: 1280, height: 420 });
	const serviceLink = page.getByRole('link', { name: 'Service Student 1' });
	await serviceLink.scrollIntoViewIfNeeded();
	const scrolled = await page.evaluate(() => scrollY);
	expect(scrolled).toBeGreaterThan(0);
	await serviceLink.click();
	await expect(page).toHaveURL(/\/app\/gear\?service=[\w-]+$/);
	await expect(dialog(page).getByLabel('Next AAD service due')).toBeHidden();
	await dialog(page).getByLabel('Work done').selectOption('aad_service');
	await expect(dialog(page).getByLabel('Next AAD service due')).toBeVisible();
	await dialog(page).getByLabel('Work done').selectOption('reserve_repack');
	await dialog(page).getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Repack recorded for Student 1')).toBeVisible();
	await expect(page).toHaveURL(/\/app\/gear$/);
	expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
	await expect(serviceLink).toBeInViewport();
	if (viewport) await page.setViewportSize(viewport);

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

	// An empty form offers sample wording: one tap fills it (form stays off), then the offer goes.
	const tandemB = page.getByTestId('builder-tandem');
	await go(page, '/app/waivers?tab=tandem');
	await expect(tandemB.getByTestId('section')).toHaveCount(0);
	await tandemB.getByTestId('starter-tandem').click();
	await expect(page.getByText('6 sample sections added. Read and edit each one before you activate the form.')).toBeVisible();
	await expect(tandemB.getByTestId('section')).toHaveCount(6);
	await expect(tandemB.getByRole('heading', { name: 'Medical declaration' })).toBeVisible();
	await expect(tandemB.getByTestId('starter-tandem')).toHaveCount(0);
	await expect(tandemB.getByTestId('toggle-tandem')).toHaveText('Activate');
	await expect(page).toHaveURL(/\/app\/waivers\?tab=tandem$/);

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
	// Print sheets skip the app shell: they still need a main landmark (skip-link target).
	await expect(page.getByRole('main').getByRole('heading', { name: 'Jump Report' })).toBeVisible();
	// Dates read like the rest of the app ("24 Oct – 22 Nov 2026"), not ISO.
	await expect(page.getByText(/^Range: \d{1,2} [A-Z][a-z]{2}( \d{4})? – \d{1,2} [A-Z][a-z]{2} \d{4}$/)).toBeVisible();
	await expect(page.getByText(/Generated on \d{1,2} [A-Z][a-z]{2} \d{4} with/)).toBeVisible();
	await go(page, '/app/reports/loadsheet');
	await expect(page.getByRole('main').getByLabel('Day', { exact: true })).toHaveAttribute('type', 'date');
});


test('Roles dialog locks the boxes you may not change, and saving keeps them', async ({ page, browser }) => {
	test.setTimeout(90_000);
	const stamp = Date.now();
	const adminEmail = `sa-admin-${stamp}@example.com`;
	async function signup(p: Page, name: string, email: string) {
		await p.goto('/signup');
		await p.getByLabel('Full name').fill(name);
		await p.getByLabel('Email').fill(email);
		await p.getByLabel('Password').fill('blue-skies-123');
		await p.getByRole('button', { name: 'Create account' }).click();
		await expect(p).toHaveURL(/\/app$/);
	}
	await signup(page, 'Oona Owner', `sa-lock-owner-${stamp}@example.com`);
	await go(page, '/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Role Lock DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	const adminCtx = await browser.newContext({ baseURL: new URL(page.url()).origin });
	const ap = await adminCtx.newPage();
	await signup(ap, 'Ada Admin', adminEmail);

	// Owner adds Ada (existing account) as admin.
	await go(page, '/app/settings/members');
	await page.getByRole('link', { name: 'Invite' }).click();
	await dialog(page).getByLabel('Email').fill(adminEmail);
	await dialog(page).getByRole('checkbox', { name: /^Staff/ }).uncheck();
	await dialog(page).getByRole('checkbox', { name: /^Admin/ }).check();
	await dialog(page).getByRole('button', { name: 'Send invite' }).click();
	await expect(page.getByText('Ada Admin added')).toBeVisible();

	// The owner's own Owner box is locked (and says why); saving other changes keeps it.
	await page.getByRole('link', { name: 'Edit roles for Oona Owner' }).click();
	const ownBox = dialog(page).getByRole('checkbox', { name: /^Owner/ });
	await expect(ownBox).toBeDisabled();
	await expect(ownBox).toBeChecked();
	await expect(dialog(page).getByTestId('role-lock')).toHaveText(["You can't remove your own owner role. Ask another owner."]);
	await dialog(page).getByRole('checkbox', { name: /^Coach/ }).check();
	await dialog(page).getByRole('button', { name: 'Save roles' }).click();
	await expect(page.getByText('Roles updated for Oona Owner')).toBeVisible();
	const oonaRow = page.locator('main li').filter({ hasText: 'Oona Owner' });
	await expect(oonaRow.getByText('Owner', { exact: true })).toBeVisible();
	await expect(oonaRow.getByText('Coach', { exact: true })).toBeVisible();

	// An admin can edit an owner's other roles: the locked Owner box is still posted.
	await go(ap, '/app/settings/members');
	await ap.getByRole('link', { name: 'Edit roles for Oona Owner' }).click();
	const theirOwner = dialog(ap).getByRole('checkbox', { name: /^Owner/ });
	await expect(theirOwner).toBeDisabled();
	await expect(theirOwner).toBeChecked();
	await expect(dialog(ap).getByTestId('role-lock')).toHaveText(['Only an owner can change this.']);
	await dialog(ap).getByRole('checkbox', { name: /^Pilot/ }).check();
	await dialog(ap).getByRole('button', { name: 'Save roles' }).click();
	await expect(ap.getByText('Roles updated for Oona Owner')).toBeVisible();
	await expect(ap.locator('main li').filter({ hasText: 'Oona Owner' }).getByText('Owner', { exact: true })).toBeVisible();

	// Her own Admin box is locked too; adding Manifest keeps Admin.
	await ap.getByRole('link', { name: 'Edit roles for Ada Admin' }).click();
	await expect(dialog(ap).getByRole('checkbox', { name: /^Admin/ })).toBeDisabled();
	await expect(dialog(ap).getByTestId('role-lock')).toHaveText(['Only an owner can change this.', "You can't remove your own admin access. Ask an owner."]);
	await dialog(ap).getByRole('checkbox', { name: /^Manifest/ }).check();
	await dialog(ap).getByRole('button', { name: 'Save roles' }).click();
	await expect(ap.getByText('Roles updated for Ada Admin')).toBeVisible();
	const adaRow = ap.locator('main li').filter({ hasText: 'Ada Admin' });
	await expect(adaRow.getByText('Admin', { exact: true })).toBeVisible();
	await expect(adaRow.getByText('Manifest / Manager', { exact: true })).toBeVisible();
	await adminCtx.close();
});
