import { expect, test } from '@playwright/test';
import { gapBelowTopBar } from './anchors.ts';

/**
 * Manifest main flow on an empty instance: new DZ → create load → add a custom jumper →
 * 20-min call → board → depart → land → complete (summary) → hangar display → staff dashboard.
 */
test('manifest: load lifecycle, slots, display and dashboard', async ({ page }) => {
	const project = test.info().project.name;
	const email = `manifest-${Date.now()}-${project}@example.com`;

	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Manny Manifest');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);

	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Manifest E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// a price, so the load detail has money to summarise
	await page.goto('/app/pricelist');
	await page.getByLabel('Sport slot', { exact: true }).fill('450');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.getByText('Price list updated')).toBeVisible();
	await page.goto('/app');

	// The dashboard's empty "Next load" card opens the New load dialog directly
	await page.getByRole('link', { name: 'Create a load' }).click();
	await expect(page).toHaveURL(/\/app\/manifest\?new=1$/);
	await expect(page.getByRole('dialog')).toContainText('Create loads');

	// Board starts empty, create a load from the dialog
	await page.goto('/app/manifest');
	await expect(page.getByTestId('manifest-heading')).toContainText('Today');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	// the URL follows the dialog (?new=1), so a reload or a shared link reopens it
	await expect(page).toHaveURL(/\/app\/manifest\?new=1$/);
	await dialog.getByLabel('Airplane name / number').fill('ZS-E2E');
	await dialog.getByLabel('Slots (pax)').fill('8');
	await dialog.getByLabel('Weight limit (kg)').fill('400');
	// several loads: the dialog previews their times and says how many it creates
	const times = dialog.getByTestId('load-times');
	await expect(times).toBeHidden();
	await dialog.getByLabel('Number of loads').fill('3');
	await dialog.getByLabel('Minutes apart').fill('20');
	await expect(times).toContainText('Set a time for the first load');
	await dialog.getByLabel('Time').fill('13:30');
	await expect(times).toHaveText('3 loads: 13:30, 13:50, 14:10');
	await expect(dialog.getByRole('button', { name: 'Create 3 loads' })).toBeVisible();
	await dialog.getByLabel('Minutes apart').fill('600');
	await expect(times).toContainText('run past midnight');
	await dialog.getByLabel('Minutes apart').fill('');
	await expect(times).toHaveText('3 loads: All at 13:30');
	await dialog.getByLabel('Number of loads').fill('1');
	await dialog.getByLabel('Time').fill('');
	await expect(times).toBeHidden();
	await dialog.getByRole('button', { name: 'Create load', exact: true }).click();
	const card = page.locator('[data-testid=load-card][data-load-number="1"]');
	await expect(card).toBeVisible();
	await expect(page).toHaveURL(/\/app\/manifest$/);

	// Load detail: add a walk-in jumper from the Custom tab
	await card.getByRole('link', { name: 'Add slots' }).click();
	await expect(page).toHaveURL(/\/app\/manifest\/[\w-]+#add$/);
	// desktop: the add panel sits beside the slot list, so the #add jump keeps the page at the top
	if (project === 'desktop') await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	await page.getByRole('tab', { name: 'Custom' }).click();
	await page.getByLabel('Jumper name').fill('Vera Visitor');
	await page.getByLabel('Slot weight (kg)').fill('72');
	await page.getByRole('button', { name: 'Create jumper slot' }).click();
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Vera Visitor"]')).toBeVisible();

	// Money line: unpaid → outstanding; marked paid (cash) → shows as paid, so the parts add up to the total
	await expect(page.getByTestId('outstanding-total')).toContainText('450');
	await expect(page.getByTestId('paid-total')).toHaveCount(0);
	await page.waitForLoadState('networkidle');
	await page.getByRole('checkbox', { name: 'Select Vera Visitor' }).check();
	await page.getByRole('button', { name: /Mark paid/ }).click();
	await expect(page.getByText('1 slot marked paid')).toBeVisible();
	await expect(page.getByTestId('paid-total')).toContainText('450');
	await expect(page.getByTestId('outstanding-total')).toHaveCount(0);

	// Overweight is rejected with a friendly message
	await page.getByLabel('Jumper name').fill('Heavy Harry');
	await page.getByLabel('Slot weight (kg)').fill('399');
	await page.getByRole('button', { name: 'Create jumper slot' }).click();
	await expect(page.getByText(/Too heavy/).first()).toBeVisible();

	// Dismissing a confirm must really cancel (an onsubmit preventDefault didn't stop use:enhance)
	const loadCard = page.getByTestId('load-card');
	await page.waitForLoadState('networkidle');
	page.once('dialog', (d) => d.dismiss());
	await loadCard.getByLabel('Load 1 actions').click();
	await loadCard.getByRole('button', { name: 'Cancel load' }).click();
	page.once('dialog', (d) => d.dismiss());
	await loadCard.getByRole('button', { name: 'Mark completed' }).click();
	await page.waitForTimeout(500);
	await page.reload();
	await expect(loadCard).toHaveAttribute('data-status', 'open');
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Vera Visitor"]')).toBeVisible();

	// Shutdown from the actions menu: minutes field + "Set shutdown", then cancel it again
	await loadCard.getByLabel('Load 1 actions').click();
	await loadCard.getByLabel('Shutdown minutes').fill('20');
	await loadCard.getByRole('button', { name: 'Set shutdown' }).click();
	await expect(loadCard.getByText('Shutdown 20 min')).toBeVisible();
	// the menu stays open after an action
	await loadCard.getByRole('button', { name: 'Cancel shutdown' }).click();
	await expect(loadCard.getByText('Shutdown 20 min')).toHaveCount(0);

	// Lifecycle via the single "next step" button
	const next = page.getByTestId('next-step');
	for (const status of ['called', 'boarding', 'departed', 'landed']) {
		await next.click();
		await expect(loadCard).toHaveAttribute('data-status', status);
	}
	await next.click();
	await expect(page.getByTestId('complete-summary')).toContainText('Load 1 completed');
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(loadCard).toHaveAttribute('data-status', 'completed');

	// Hangar display and the staff dashboard part
	await page.goto('/app/display');
	await expect(page.getByTestId('hangar-board')).toBeVisible();
	// the dropzone name is the board's page heading (screen readers)
	await expect(page.getByTestId('hangar-board').getByRole('heading', { level: 1 })).toBeVisible();
	// The public TV link shows the bare board: one main landmark, no booking-site header/footer
	await page.locator('summary[aria-label="Public display link"]').click();
	await page.getByTestId('create-public-link').click();
	const publicUrl = await page.getByTestId('public-url').inputValue();
	const tv = await page.context().browser()!.newContext();
	const tvPage = await tv.newPage();
	await tvPage.goto(publicUrl);
	await expect(tvPage.getByTestId('hangar-board')).toBeVisible();
	await expect(tvPage.getByRole('main')).toHaveCount(1);
	await expect(tvPage.getByText(/Bookings by/)).toHaveCount(0);
	await tv.close();
	await page.goto('/app');
	await expect(page.getByTestId('staff-today')).toContainText('Loads flown');
	await expect(page.getByTestId('staff-today')).toContainText('of 1 manifested');

	// The 15 s live poll re-runs only the small (home) layout load, not the whole dashboard
	// (nodes: root layout, app layout, (home) layout, page). A visible tab polls on visibilitychange.
	await page.waitForLoadState('networkidle');
	const poll = page.waitForResponse((r) => r.url().includes('/app/__data.json'));
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	const res = await poll;
	const nodes = JSON.parse((await res.text()).split('\n')[0]).nodes as { type: string }[];
	expect(nodes.map((n) => n?.type)).toEqual(['skip', 'skip', 'data', 'skip']);
	await expect(page.getByTestId('staff-today')).toContainText('of 1 manifested');
});

test('manifest without JS: destructive load actions ask on a confirmation step first', async ({ page, browser }) => {
	const project = test.info().project.name;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Nora NoScript');
	await page.getByLabel('Email').fill(`nojs-${Date.now()}-${project}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`NoJS E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-NJS');
	await dialog.getByLabel('Slots (pax)').fill('8');
	await dialog.getByLabel('Weight limit (kg)').fill('400');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	await expect(page.getByTestId('load-card')).toBeVisible();

	// Same session, JavaScript off (also what a tap before hydration does: a native form POST)
	const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState(), viewport: page.viewportSize() ?? undefined });
	const nojs = await ctx.newPage();
	await nojs.goto('/app/manifest');
	const card = nojs.getByTestId('load-card');
	await card.getByLabel('Load 1 actions').click();
	await card.getByRole('button', { name: 'Mark completed' }).click();
	const step = nojs.getByTestId('confirm-step');
	await expect(step).toContainText('Mark load 1 as completed? Wallets are charged and logbooks written.');
	await step.getByRole('link', { name: 'Go back' }).click();
	await expect(nojs).toHaveURL(/\/app\/manifest$/);
	await expect(nojs.getByTestId('confirm-step')).toHaveCount(0);
	await expect(card).toHaveAttribute('data-status', 'open');

	await card.getByLabel('Load 1 actions').click();
	await card.getByRole('button', { name: 'Cancel load' }).click();
	await expect(step).toContainText('Cancel load 1? Wallet holds are released.');
	await expect(card).toHaveAttribute('data-status', 'open');
	await step.getByRole('button', { name: 'Cancel load' }).click();
	await expect(card).toHaveAttribute('data-status', 'cancelled');
	await ctx.close();
});

test('manifest without JS: actions on another day stay on that day', async ({ page, browser }) => {
	const project = test.info().project.name;
	const day = '2030-01-15';
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Dana DayKeeper');
	await page.getByLabel('Email').fill(`nojs-day-${Date.now()}-${project}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`NoJS Day E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState(), viewport: page.viewportSize() ?? undefined });
	const nojs = await ctx.newPage();
	await nojs.goto(`/app/manifest?day=${day}`);
	// "Create load" is a ?new=1 link: the server renders the dialog open, Cancel is a link back
	await nojs.getByRole('link', { name: 'Create load' }).click();
	await expect(nojs).toHaveURL(new RegExp(`\\?day=${day}&new=1$`));
	const createDialog = nojs.locator('dialog[open]');
	await expect(createDialog).toContainText('Create loads');
	await expect(createDialog.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', `?day=${day}`);
	await createDialog.getByRole('link', { name: 'Cancel' }).click();
	await expect(nojs).toHaveURL(new RegExp(`\\?day=${day}$`));
	await expect(nojs.locator('dialog[open]')).toHaveCount(0);
	// create a load for that day with a native POST: the board re-renders the same day, dialog closed
	await nojs.getByRole('link', { name: 'Create load' }).click();
	await createDialog.getByLabel('Airplane name / number').fill('ZS-DAY');
	await createDialog.getByLabel('Slots (pax)').fill('8');
	await createDialog.getByLabel('Weight limit (kg)').fill('400');
	await expect(createDialog.locator('form[method=POST]')).toHaveAttribute('action', `?/createLoad&day=${day}`);
	await createDialog.getByRole('button', { name: 'Create load' }).click();
	const card = nojs.getByTestId('load-card');
	await expect(card).toHaveCount(1);
	await expect(nojs.locator('dialog[open]')).toHaveCount(0);
	await nojs.goto(`/app/manifest?day=${day}`);
	await expect(card).toHaveCount(1);
	await expect(card.locator(`form[action="?/cancel&day=${day}"]`)).toHaveCount(1);

	await card.getByLabel('Load 1 actions').click();
	await card.getByRole('button', { name: 'Cancel load' }).click();
	const step = nojs.getByTestId('confirm-step');
	await expect(step).toBeVisible();
	await expect(step.getByRole('link', { name: 'Go back' })).toHaveAttribute('href', `/app/manifest?day=${day}`);
	await step.getByRole('button', { name: 'Cancel load' }).click();
	await expect(nojs).toHaveURL(new RegExp(`day=${day}`));
	await expect(card).toHaveAttribute('data-status', 'cancelled');
	await ctx.close();
});

test('board slot rows open the slot editor (?slot=), also before hydration / without JS', async ({ page, browser }) => {
	const project = test.info().project.name;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Sally SlotLink');
	await page.getByLabel('Email').fill(`slotlink-${Date.now()}-${project}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`SlotLink E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// two loads, a walk-in jumper on load 1
	await page.goto('/app/manifest?new=1');
	const dialog = page.locator('dialog[open]');
	await dialog.getByLabel('Airplane name / number').fill('ZS-SLT');
	await dialog.getByLabel('Slots (pax)').fill('8');
	await dialog.getByLabel('Weight limit (kg)').fill('900');
	await dialog.getByLabel('Number of loads').fill('2');
	await dialog.getByRole('button', { name: 'Create 2 loads' }).click();
	await expect(page.getByTestId('load-card')).toHaveCount(2);
	const load1 = page.locator('[data-testid=load-card][data-load-number="1"]');
	await load1.getByRole('link', { name: 'Add slots' }).click();
	await expect(page).toHaveURL(/\/app\/manifest\/[\w-]+#add$/);
	await page.getByRole('tab', { name: 'Custom' }).click();
	await page.getByLabel('Jumper name').fill('Sam Slot');
	await page.getByLabel('Slot weight (kg)').fill('80');
	await page.getByRole('button', { name: 'Create jumper slot' }).click();
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Sam Slot"]')).toBeVisible();

	// JS: the board's slot row is a link to the load page with the editor open; closing drops ?slot=
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await load1.getByTestId('slot-link').filter({ hasText: 'Sam Slot' }).click();
	await expect(page).toHaveURL(/\/app\/manifest\/[\w-]+\?slot=[\w-]+$/);
	const editor = page.locator('dialog[open]').filter({ has: page.getByTestId('slot-editor') });
	await expect(editor.getByRole('heading', { name: 'Sam Slot' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await editor.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByTestId('slot-editor')).toHaveCount(0);
	await expect(page).toHaveURL(/\/app\/manifest\/[\w-]+$/);
	// the edit button on the load page is a ?slot= link too
	await page.getByRole('link', { name: 'Edit Sam Slot' }).click();
	await expect(page).toHaveURL(/\?slot=[\w-]+$/);
	await expect(editor.getByRole('heading', { name: 'Sam Slot' })).toBeVisible();

	// No JS (= a tap before hydration): the link opens the editor server-rendered; Move works natively
	const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState(), viewport: page.viewportSize() ?? undefined });
	const nojs = await ctx.newPage();
	await nojs.goto('/app/manifest');
	await nojs.getByTestId('slot-link').filter({ hasText: 'Sam Slot' }).click();
	await expect(nojs).toHaveURL(/\?slot=[\w-]+$/);
	const nojsEditor = nojs.locator('dialog[open]').filter({ has: nojs.getByTestId('slot-editor') });
	await expect(nojsEditor).toContainText('Sam Slot');
	const moveForm = nojsEditor.locator('form[method=POST]').filter({ has: nojs.getByLabel('Move to load') });
	await expect(moveForm).toHaveAttribute('action', '?/moveSlot');
	await moveForm.getByLabel('Move to load').selectOption({ label: 'Load 2 · 8 free' });
	await moveForm.getByRole('button', { name: 'Move' }).click();
	// lands with the editor closed and Sam gone from load 1
	await expect(nojs.getByTestId('slot-editor')).toHaveCount(0);
	await expect(nojs.locator('[data-testid=detail-slot][data-slot-name="Sam Slot"]')).toHaveCount(0);
	await nojs.goto('/app/manifest');
	await expect(nojs.locator('[data-testid=load-card][data-load-number="2"]').getByTestId('slot-link')).toHaveText('Sam Slot');
	await ctx.close();
});

test('slot editor: marking paid with unsaved price edits saves them first and charges the new total', async ({ page }) => {
	const project = test.info().project.name;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Paula Payfirst');
	await page.getByLabel('Email').fill(`payfirst-${Date.now()}-${project}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`PayFirst E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/pricelist');
	await page.getByLabel('Sport slot', { exact: true }).fill('450');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.getByText('Price list updated')).toBeVisible();

	await page.goto('/app/manifest?new=1');
	const dialog = page.locator('dialog[open]');
	await dialog.getByLabel('Airplane name / number').fill('ZS-PAY');
	await dialog.getByLabel('Slots (pax)').fill('8');
	await dialog.getByLabel('Weight limit (kg)').fill('900');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	await page.getByTestId('load-card').getByRole('link', { name: 'Add slots' }).click();
	await page.getByRole('tab', { name: 'Custom' }).click();
	await page.getByLabel('Jumper name').fill('Pat Payer');
	await page.getByLabel('Slot weight (kg)').fill('80');
	await page.getByRole('button', { name: 'Create jumper slot' }).click();
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Pat Payer"]')).toBeVisible();

	await page.waitForLoadState('networkidle');
	await page.getByRole('link', { name: 'Edit Pat Payer' }).click();
	const editor = page.locator('dialog[open]').filter({ has: page.getByTestId('slot-editor') });
	await expect(editor.getByRole('heading', { name: 'Pat Payer' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	// The side sheet takes the whole width on a phone (the UA dialog max-width once left a strip).
	const vw = page.viewportSize()!.width;
	const sheet = (await editor.boundingBox())!;
	expect(sheet.width).toBeCloseTo(Math.min(416, vw), 0);
	// nothing edited: plain "Mark paid"
	await expect(editor.getByRole('button', { name: 'Mark paid', exact: true })).toBeVisible();
	await expect(editor.getByTestId('slot-pay-note')).toHaveCount(0);
	// a new base price: Mark paid alone would charge R 450 and drop the edit
	await editor.getByLabel(/Custom base price/).fill('500');
	await expect(editor.getByRole('button', { name: 'Mark paid', exact: true })).toHaveCount(0);
	const both = editor.getByRole('button', { name: 'Save & mark paid' });
	await expect(both).toHaveAccessibleDescription(/saves the slot first/);
	await editor.getByLabel('Payment method').selectOption('card');
	await both.click();
	await expect(page.getByText('Slot saved and marked as paid')).toBeVisible();
	await expect(page.getByTestId('slot-editor')).toHaveCount(0);
	const row = page.locator('[data-testid=detail-slot][data-slot-name="Pat Payer"]');
	await expect(row).toContainText('500');
	await expect(row).toContainText(/Paid · Card/);
	// reopened: paid, so there is no pay form at all
	await page.getByRole('link', { name: 'Edit Pat Payer' }).click();
	await expect(editor).toContainText('Paid via Card');
	await expect(editor.getByRole('button', { name: /Mark paid/ })).toHaveCount(0);
});

test('public display needs a valid token', async ({ page }) => {
	const res = await page.goto('/dz/no-such-dz/display?token=nope-nope-nope-nope');
	expect(res?.status()).toBe(404);
	// the error page keeps its content in a main landmark
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Off the landing area');
});

test('add-to-load picker warns before submit when more people are ticked than fit', async ({ page }) => {
	const project = test.info().project.name;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Fran Full');
	await page.getByLabel('Email').fill(`full-${Date.now()}-${project}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Full E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// a one-seat load with a walk-in on it is full
	await page.goto('/app/manifest');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-ONE');
	await dialog.getByLabel('Slots (pax)').fill('1');
	await dialog.getByRole('button', { name: 'Create load', exact: true }).click();
	const card = page.locator('[data-testid=load-card][data-load-number="1"]');
	await card.getByRole('link', { name: 'Add slots' }).click();
	await page.waitForLoadState('networkidle');
	await page.getByRole('tab', { name: 'Custom' }).click();
	await page.getByLabel('Jumper name').fill('Wally Walkin');
	await page.getByLabel('Slot weight (kg)').fill('80');
	await page.getByRole('button', { name: 'Create jumper slot' }).click();
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Wally Walkin"]')).toBeVisible();

	// ticking someone says so right away and keeps the button off (no round trip to learn it)
	await page.getByRole('tab', { name: 'Members' }).click();
	const over = page.getByRole('tabpanel').getByTestId('add-over');
	const add = page.getByRole('button', { name: 'Add jumper', exact: true });
	await expect(over).toBeHidden();
	await page.getByRole('tabpanel').getByRole('checkbox', { name: /Fran Full/ }).check();
	await expect(over).toHaveText('This load is full. Pick another load or make space first.');
	await expect(add).toBeDisabled();

	// the Tandem tab says a group (passenger + TI) can't fit either
	await page.getByRole('tab', { name: 'Tandem' }).click();
	await expect(over).toHaveText('This load is full. Pick another load or make space first.');
	await expect(page.getByTestId('add-tandem')).toBeDisabled();
	await page.getByRole('tab', { name: 'Members' }).click();
	await page.getByRole('tabpanel').getByRole('checkbox', { name: /Fran Full/ }).check();

	// one more seat: the same selection fits again
	await page.getByText('Plane, pilot & time').click();
	await page.getByLabel('Slots (pax)').fill('2');
	await page.getByRole('button', { name: 'Save load' }).click();
	await expect(page.locator('[aria-live]').getByText('Load updated')).toBeVisible();
	await expect(over).toBeHidden();
	await expect(add).toBeEnabled();
	await page.getByRole('tab', { name: 'Tandem' }).click();
	await expect(over).toHaveText('A tandem needs 2 slots, but only 1 slot is left. Pick another load or make space first.');
	await page.getByRole('tab', { name: 'Members' }).click();
	await page.getByRole('tabpanel').getByRole('checkbox', { name: /Fran Full/ }).check();
	await add.click();
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Fran Full"]')).toBeVisible();
});

test('add-to-load picker says who is already on another load that day', async ({ page }) => {
	const project = test.info().project.name;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Olga Onload');
	await page.getByLabel('Email').fill(`onload-${Date.now()}-${project}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Onload E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// two loads at once
	await page.goto('/app/manifest');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-TWO');
	await dialog.getByLabel('Slots (pax)').fill('8');
	await dialog.getByLabel('Number of loads').fill('2');
	await dialog.getByLabel('Minutes apart').fill('40');
	// a gap without a first time used to be dropped silently (two untimed loads)
	await dialog.getByRole('button', { name: 'Create 2 loads' }).click();
	await expect(page.locator('[aria-live]').getByText('Set a time for the first load')).toBeVisible();
	await expect(page.locator('[data-testid=load-card]')).toHaveCount(0);
	await expect(dialog.getByLabel('Minutes apart')).toHaveValue('40');
	await dialog.getByLabel('Time').fill('08:30');
	await dialog.getByRole('button', { name: 'Create 2 loads' }).click();
	const load1 = page.locator('[data-testid=load-card][data-load-number="1"]');
	await expect(page.locator('[data-testid=load-card][data-load-number="2"]')).toBeVisible();
	await expect(load1).toContainText('08:30');
	await expect(page.locator('[data-testid=load-card][data-load-number="2"]')).toContainText('09:10');

	// put the owner on load 1 from the Members tab
	await load1.getByRole('link', { name: 'Add slots' }).click();
	await page.waitForLoadState('networkidle');
	await page.getByRole('tab', { name: 'Members' }).click();
	await page.getByRole('tabpanel').getByRole('checkbox', { name: /Olga Onload/ }).check();
	await page.getByRole('button', { name: 'Add jumper', exact: true }).click();
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Olga Onload"]')).toBeVisible();
	// on its own load the row is disabled, without the other-load hint
	await expect(page.getByRole('tabpanel').getByRole('checkbox', { name: /Olga Onload/ })).toBeDisabled();
	await expect(page.locator('[data-also-on]')).toHaveCount(0);

	// load 2's picker flags her as already on load 1, but still lets you add her
	await page.goto('/app/manifest');
	await page.locator('[data-testid=load-card][data-load-number="2"]').getByRole('link', { name: 'Add slots' }).click();
	await page.waitForLoadState('networkidle');
	await page.getByRole('tab', { name: 'Members' }).click();
	const row = page.getByRole('tabpanel').locator('label', { has: page.getByRole('checkbox', { name: /Olga Onload/ }) });
	await expect(row.locator('[data-also-on]')).toHaveText('On load 1');
	await expect(row.getByRole('checkbox')).toBeEnabled();

	// Pilots can't jump on the load they fly: make Olga a pilot too, fly load 2 → her row is
	// disabled there; on load 1 (where she jumps) picking her as pilot is refused.
	await page.goto('/app/settings/members');
	await page.getByRole('link', { name: 'Edit roles for Olga Onload' }).click();
	await page.locator('dialog[open]').getByRole('checkbox', { name: /Pilot/ }).check();
	await page.locator('dialog[open]').getByRole('button', { name: 'Save roles' }).click();
	await expect(page.getByText('Roles updated for Olga Onload')).toBeVisible();
	await page.goto('/app/manifest');
	await page.locator('[data-testid=load-card][data-load-number="2"]').getByRole('link', { name: 'Add slots' }).click();
	await page.waitForLoadState('networkidle');
	await page.getByText('Plane, pilot & time').click();
	await page.getByLabel('Pilot', { exact: true }).selectOption({ label: 'Olga Onload' });
	await page.getByRole('button', { name: 'Save load' }).click();
	await expect(page.locator('[aria-live]').getByText('Load updated')).toBeVisible();
	await page.getByRole('tab', { name: 'Members' }).click();
	const pilotRow = page.getByRole('tabpanel').locator('label', { has: page.getByRole('checkbox', { name: /Olga Onload/ }) });
	await expect(pilotRow).toContainText('Flying this load');
	await expect(pilotRow.getByRole('checkbox')).toBeDisabled();
	await page.goto('/app/manifest');
	await load1.getByRole('link', { name: 'Add slots' }).click();
	await page.waitForLoadState('networkidle');
	// she jumps on load 1, so its Pilot select lists her disabled (the server refuses it too)
	await page.getByText('Plane, pilot & time').click();
	await expect(page.getByLabel('Pilot', { exact: true }).locator('option', { hasText: 'Olga Onload' })).toHaveText('Olga Onload · jumping on this load');
	await expect(page.getByLabel('Pilot', { exact: true }).locator('option', { hasText: 'Olga Onload' })).toBeDisabled();

	// on a phone the panel sits below the slot list: the board's "Add slots" lands on it
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/app/manifest');
	await load1.getByRole('link', { name: 'Add slots' }).click();
	await expect(page).toHaveURL(/#add$/);
	await expect(page.getByRole('heading', { name: 'Add to load' })).toBeInViewport();
	await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('add')!.getBoundingClientRect().top))).toBeLessThan(200);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
	// ... with its heading below the sticky phone top bar, not hidden under it
	await expect.poll(() => gapBelowTopBar(page, 'add')).toBeGreaterThanOrEqual(8);

	// Her jumper page lists the slot; on a phone the table folds day + load under the jump
	// instead of scrolling sideways (a scroll region keyboard users can't reach).
	await page.goto('/app/jumpers');
	await page.locator('main a[href^="/app/jumpers/"]').filter({ hasText: 'Olga Onload' }).first().click();
	await expect(page).toHaveURL(/\/app\/jumpers\/[^/]+$/);
	const recent = page.locator('main table').filter({ has: page.getByRole('columnheader', { name: 'Price' }) }).last();
	const meta = recent.getByTestId('recent-jump-meta');
	await expect(meta).toBeVisible();
	await expect(meta).toHaveText(/^\d{1,2} \w{3} \d{4} · Load #1 · ZS-TWO$/);
	await expect(recent.getByRole('columnheader', { name: 'Day' })).toBeHidden();
	const overflow = () => recent.evaluate((t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth);
	expect(await overflow()).toBeLessThanOrEqual(0);
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(meta).toBeHidden();
	await expect(recent.getByRole('columnheader', { name: 'Day' })).toBeVisible();
	await expect(recent.locator('tbody tr').first()).toContainText(/\d{1,2} \w{3} \d{4}/);
	expect(await overflow()).toBeLessThanOrEqual(0);

	// Times are the dropzone's clock, not the viewer's: a browser on New York time (after
	// hydration) and the server render (UTC on Workers) both print load 1 at 08:30.
	const away = await page.context().browser()!.newContext({ timezoneId: 'America/New_York', storageState: await page.context().storageState() });
	const awayPage = await away.newPage();
	await awayPage.goto(new URL('/app/reports/loadsheet', page.url()).href);
	await awayPage.waitForLoadState('networkidle');
	const sheet = awayPage.getByRole('main');
	await expect(sheet.locator('section').first()).toContainText('· 08:30');
	await expect(sheet.locator('section').nth(1)).toContainText('· 09:10');
	await away.close();
});

test('Tandem tab adds a passenger + TI group and flags booked outside video without a camera flyer', async ({ page }) => {
	const project = test.info().project.name;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Tina Tandem');
	await page.getByLabel('Email').fill(`tandemtab-${Date.now()}-${project}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Tandem tab E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// The owner is the TI; outside video is priced so the walk-in can book it.
	await page.goto('/app/settings/members');
	await page.getByRole('link', { name: 'Edit roles for Tina Tandem' }).click();
	await page.locator('dialog[open]').getByRole('checkbox', { name: /Tandem instructor/ }).check();
	await page.locator('dialog[open]').getByRole('button', { name: 'Save roles' }).click();
	await expect(page.getByText('Roles updated for Tina Tandem')).toBeVisible();
	await page.goto('/app/pricelist');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Outside video', { exact: true }).fill('900');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.getByText('Price list updated')).toBeVisible();

	// A walk-in for today with a long name and booked outside video.
	const pax = 'Maximiliana Wolfeschlegelsteinhausen-Bergerdorff';
	await page.goto('/app/tandems?new=1');
	await page.waitForLoadState('networkidle');
	const create = page.locator('dialog[open] form[method=POST]');
	await create.getByLabel('Full name').fill(pax);
	await create.getByLabel('Weight (kg)').fill('70');
	await create.locator('label', { hasText: 'Outside video' }).getByRole('checkbox').check();
	await create.getByRole('button', { name: 'Create tandem passenger' }).click();
	await expect(page.locator('[aria-live]').getByText(/created|added/i).first()).toBeVisible();

	await page.goto('/app/manifest?new=1');
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-TAN');
	await dialog.getByLabel('Slots (pax)').fill('4');
	await dialog.getByRole('button', { name: 'Create load', exact: true }).click();
	await page.locator('[data-testid=load-card][data-load-number="1"]').getByRole('link', { name: 'Add slots' }).click();
	await page.waitForLoadState('networkidle');
	await page.getByRole('tab', { name: 'Tandem' }).click();
	const panel = page.getByRole('tabpanel');

	// The passenger list stays inside the panel on a phone (a fieldset used to grow to its
	// longest unbreakable line and push the rows past the screen edge).
	await page.setViewportSize({ width: 390, height: 844 });
	const overflow = () => panel.locator('form').evaluate((f) => f.querySelector('fieldset')!.getBoundingClientRect().right - f.getBoundingClientRect().right);
	expect(await overflow()).toBeLessThanOrEqual(0.5);

	await panel.getByRole('radio', { name: new RegExp(pax) }).check();
	await panel.getByLabel('2. Tandem instructor').selectOption({ label: 'Tina Tandem' });
	const hint = panel.getByTestId('tandem-video-hint');
	await expect(hint).toHaveText(`${pax} booked outside video: pick who films them under 3. Outside video.`);
	await expect(panel.getByText('Uses 2 slots')).toBeVisible();
	await panel.getByLabel('4. Note (optional)').fill('Nervous flyer');
	await panel.getByTestId('add-tandem').click();
	await expect(page.locator(`[data-testid=detail-slot][data-slot-name="${pax}"]`)).toBeVisible();
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Tina Tandem"]')).toBeVisible();
	// The passenger left the Tandem list and the form reset.
	await expect(panel.getByRole('radio', { name: new RegExp(pax) })).toHaveCount(0);
	await expect(hint).toHaveCount(0);

	// The load sheet spaces the staff role off the jump ("Tandem · TI", not "Tandem· TI") and
	// keeps fixed columns on paper so every load's table lines up, long names included.
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/app/reports/loadsheet');
	const sheet = page.getByRole('main').getByTestId('loadsheet-table').first();
	await expect(sheet.getByRole('row', { name: /Tina Tandem/ }).getByRole('cell').nth(3)).toHaveText('Tandem · TI');
	expect(await sheet.evaluate((t) => getComputedStyle(t).tableLayout)).toBe('fixed');
	const jumpCol = (await sheet.getByRole('columnheader', { name: 'Jump' }).boundingBox())!;
	expect(Math.round(jumpCol.width)).toBe(160);
});
