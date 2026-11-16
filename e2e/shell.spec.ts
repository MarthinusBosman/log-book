import { expect, test, type Page } from '@playwright/test';

/** The app shell (menu, dropzone switcher, theme toggle) works before hydration / without JS, and in place with JS. */
async function signup(page: Page, name: string) {
	const email = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
}

async function createDropzone(page: Page, name: string) {
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(name);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
}

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'));

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('menu page, dropzone switcher and theme toggle', async ({ page }) => {
		const mobile = test.info().project.name === 'mobile';
		const stamp = `${test.info().project.name} ${Date.now()}`;
		const first = `Shell First ${stamp}`;
		const second = `Shell Second ${stamp}`;
		await signup(page, 'Nora Nojs');
		await createDropzone(page, first);
		await createDropzone(page, second);

		// The menu: on phones "More" and the top-bar dropzone button are links to /app/menu
		let menu = page.locator('aside');
		if (mobile) {
			await page.goto('/app/wallet');
			await page.getByRole('navigation', { name: 'Quick' }).getByRole('link', { name: 'More' }).click();
			await expect(page).toHaveURL(/\/app\/menu$/);
			await expect(page).toHaveTitle(/Menu/);
			menu = page.getByTestId('menu-page');
			await expect(menu).toBeVisible();
			await expect(page.getByRole('navigation', { name: 'Quick' }).getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page');
			await expect(menu.getByTestId('feedback-link')).toHaveAttribute('href', '/app/feedback');
			await menu.getByRole('link', { name: 'Wallet' }).click();
			await expect(page).toHaveURL(/\/app\/wallet$/);
			await page.getByRole('link', { name: /^Open menu/ }).click();
			await expect(page).toHaveURL(/\/app\/menu$/);
		} else {
			await page.goto('/app/wallet?tab=history');
		}

		// Dropzone switcher: a <details> disclosure with plain form posts
		const switcher = menu.getByTestId('dz-switcher');
		await expect(switcher.locator('summary')).toContainText(second);
		await expect(switcher.getByRole('button', { name: new RegExp(first) })).toBeHidden();
		await switcher.locator('summary').click();
		await expect(switcher.getByRole('button', { name: new RegExp(second) })).toHaveAttribute('aria-current', 'true');
		await switcher.getByRole('button', { name: new RegExp(first) }).click();
		// Back to the same page (with its view params); from the menu page, to the dashboard
		await expect(page).toHaveURL(mobile ? /\/app$/ : /\/app\/wallet\?tab=history$/);
		const shell = mobile ? page.getByRole('link', { name: `Open menu · ${first}` }) : page.locator('aside');
		await expect(shell).toContainText(first);

		// Theme toggle: POST /theme, back to the same page, choice kept
		if (mobile) await page.goto('/app/menu');
		const scope = mobile ? page.getByTestId('menu-page') : page.locator('aside');
		expect(await isDark(page)).toBe(true);
		await scope.getByRole('button', { name: 'Switch to light theme' }).click();
		await expect(page).toHaveURL(mobile ? /\/app\/menu$/ : /\/app\/wallet\?tab=history$/);
		expect(await isDark(page)).toBe(false);
		await page.reload();
		expect(await isDark(page)).toBe(false);
		await scope.getByRole('button', { name: 'Switch to dark theme' }).click();
		expect(await isDark(page)).toBe(true);
	});
});

test('with JavaScript the menu, switcher and theme toggle work in place', async ({ page }) => {
	const mobile = test.info().project.name === 'mobile';
	const stamp = `${test.info().project.name} ${Date.now()}`;
	const first = `Shell JS First ${stamp}`;
	const second = `Shell JS Second ${stamp}`;
	await signup(page, 'Jojo Js');
	await createDropzone(page, first);
	await createDropzone(page, second);
	await page.goto('/app/wallet');
	await page.waitForLoadState('networkidle');

	let menu = page.locator('aside');
	if (mobile) {
		await page.getByRole('navigation', { name: 'Quick' }).getByRole('link', { name: 'More' }).click();
		menu = page.locator('dialog[open]');
		await expect(menu).toBeVisible();
		await expect(page).toHaveURL(/\/app\/wallet$/); // drawer opens in place, no navigation
	}

	// Switcher opens; Escape / an outside click closes it
	const switcher = menu.getByTestId('dz-switcher');
	await switcher.locator('summary').click();
	const other = switcher.getByRole('button', { name: new RegExp(first) });
	await expect(other).toBeVisible();
	if (!mobile) {
		await page.locator('main h1').first().click();
		await expect(other).toBeHidden();
		await switcher.locator('summary').click();
		await expect(other).toBeVisible();
	}
	await other.click();
	await expect(page).toHaveURL(/\/app\/wallet$/);
	await expect(mobile ? page.getByRole('link', { name: `Open menu · ${first}` }) : page.locator('aside')).toContainText(first);

	// Theme toggle flips in place (no form post)
	if (mobile) {
		await page.getByRole('navigation', { name: 'Quick' }).getByRole('link', { name: 'More' }).click();
		menu = page.locator('dialog[open]');
	}
	expect(await isDark(page)).toBe(true);
	let posted = false;
	page.on('request', (r) => {
		if (r.method() === 'POST' && new URL(r.url()).pathname === '/theme') posted = true;
	});
	await menu.getByRole('button', { name: 'Switch to light theme' }).click();
	await expect.poll(() => isDark(page)).toBe(false);
	expect(posted).toBe(false);
	await page.reload();
	expect(await isDark(page)).toBe(false);
});
