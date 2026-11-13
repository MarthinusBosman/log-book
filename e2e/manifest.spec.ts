import { expect, test } from '@playwright/test';

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

	// Board starts empty, create a load from the dialog
	await page.goto('/app/manifest');
	await expect(page.getByTestId('manifest-heading')).toContainText('Today');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-E2E');
	await dialog.getByLabel('Slots (pax)').fill('8');
	await dialog.getByLabel('Weight limit (kg)').fill('400');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	const card = page.locator('[data-testid=load-card][data-load-number="1"]');
	await expect(card).toBeVisible();

	// Load detail: add a walk-in jumper from the Custom tab
	await card.getByRole('link', { name: 'Add slots' }).click();
	await expect(page).toHaveURL(/\/app\/manifest\/[\w-]+$/);
	await page.getByRole('tab', { name: 'Custom' }).click();
	await page.getByLabel('Jumper name').fill('Vera Visitor');
	await page.getByLabel('Slot weight (kg)').fill('72');
	await page.getByRole('button', { name: 'Create jumper slot' }).click();
	await expect(page.locator('[data-testid=detail-slot][data-slot-name="Vera Visitor"]')).toBeVisible();

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
	await page.goto('/app');
	await expect(page.getByTestId('staff-today')).toContainText('Loads flown');
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
	// create a load for that day with a native POST: the board re-renders the same day
	const created = await nojs.request.post(`/app/manifest?/createLoad&day=${day}`, {
		form: { day, count: '1', aircraftName: 'ZS-DAY', capacity: '8', weightLimitKg: '400' },
		headers: { Accept: 'text/html', Origin: new URL(nojs.url()).origin }
	});
	expect(created.status()).toBeLessThan(400);
	await nojs.goto(`/app/manifest?day=${day}`);
	const card = nojs.getByTestId('load-card');
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

test('public display needs a valid token', async ({ page }) => {
	const res = await page.goto('/dz/no-such-dz/display?token=nope-nope-nope-nope');
	expect(res?.status()).toBe(404);
});
