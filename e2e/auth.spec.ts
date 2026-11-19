import { expect, test } from '@playwright/test';

test('landing renders', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Run the dropzone');
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\.png$/);
	await expect(page.getByRole('link', { name: 'Self-host it' })).toHaveAttribute('href', '/self-host');
	await page.screenshot({ path: `test-results/landing-${test.info().project.name}.png`, fullPage: false });
});

test('landing: jumper and dropzone sign-up paths are separate; dropzone path lands on "Set up a dropzone"', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Sign up as a jumper' }).first()).toHaveAttribute('href', '/signup');
	await page.getByRole('link', { name: 'Set up a dropzone' }).first().click();
	await expect(page).toHaveURL(/\/signup\?redirectTo=%2Fapp%2Fdropzones%2Fnew$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up your dropzone');
	await expect(page.getByTestId('signup-kind')).toContainText('Step 1 of 2');
	await page.getByLabel('Full name').fill('Owen Owner');
	await page.getByLabel('Email').fill(`e2e-dz-${Date.now()}-${test.info().project.name}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account and continue' }).click();
	await expect(page).toHaveURL(/\/app\/dropzones\/new$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up a dropzone');
	// Plain signup offers the dropzone path too.
	await page.context().clearCookies();
	await page.goto('/signup');
	await expect(page.getByTestId('signup-kind').getByRole('link', { name: 'Set up your dropzone' })).toHaveAttribute('href', '/signup?redirectTo=%2Fapp%2Fdropzones%2Fnew');
});

test('landing says it is free for everyone and a passion project', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('Free for everyone. No card, no catch.')).toBeVisible();
	await expect(page.locator('#pricing')).toContainText('passion project');
	await expect(page.locator('#pricing')).toContainText('don’t make money from it');
	await expect(page.locator('footer')).toContainText('give back to the skydiving community');
});

test('privacy policy + terms: linked from footer and signup, no JS', async ({ page }) => {
	await page.goto('/');
	await page.locator('footer').getByRole('link', { name: 'Privacy policy' }).click();
	await expect(page).toHaveURL(/\/privacy$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
	await expect(page.getByRole('heading', { name: 'Your rights' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'inforegulator.org.za', exact: true })).toHaveAttribute('href', 'https://inforegulator.org.za');
	// links in the body text are underlined, not told apart by colour alone
	await expect(page.getByRole('link', { name: 'inforegulator.org.za', exact: true })).toHaveCSS('text-decoration-line', 'underline');
	// Not log-book.app → says this text is about the hosted service.
	await expect(page.getByTestId('selfhost-note')).toBeVisible();
	await expect(page.locator('script[src]')).toHaveCount(0);
	await page.goto('/terms');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of use');
	await expect(page.getByRole('heading', { name: 'Skydiving safety' })).toBeVisible();
	await page.goto('/signup');
	const legal = page.getByTestId('signup-legal');
	await expect(legal.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
	await expect(legal.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
});

test('a used or expired set-password link says so before asking for a password', async ({ page }) => {
	await page.goto('/reset-password?token=not-a-real-token');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a new password');
	await expect(page.getByTestId('link-expired')).toContainText('expired or was already used');
	await expect(page.getByTestId('link-expired').getByRole('link', { name: 'Get a new link' })).toHaveAttribute('href', '/forgot-password');
	await expect(page.locator('input[name=password]')).toHaveCount(0);
	await page.goto('/reset-password');
	await expect(page.getByText('missing its token')).toBeVisible();
});

test('common auth URL guesses redirect to the real pages', async ({ page }) => {
	await page.goto('/register?redirectTo=%2Fapp%2Fwallet');
	await expect(page).toHaveURL(/\/signup\?redirectTo=%2Fapp%2Fwallet$/);
	await page.goto('/sign-in');
	await expect(page).toHaveURL(/\/login$/);
	const res = await page.request.get('/signin', { maxRedirects: 0 });
	expect(res.status()).toBe(301);
	expect((await page.request.get('/registerx')).status()).toBe(404);
});

test.describe('new dropzone preselects the country from the browser timezone', () => {
	// An en-US browser in Johannesburg is common: the zone, not the language, says where the DZ is.
	test.use({ timezoneId: 'Africa/Johannesburg', locale: 'en-US' });
	test('Africa/Johannesburg + en-US → South Africa / ZAR', async ({ page }) => {
		await page.goto('/signup');
		await page.getByLabel('Full name').fill('Zoe Zone');
		await page.getByLabel('Email').fill(`e2e-tz-${Date.now()}-${test.info().project.name}@example.com`);
		await page.getByLabel('Password').fill('blue-skies-123');
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page).toHaveURL(/\/app$/);
		await page.goto('/app/dropzones/new');
		await expect(page.locator('select[name=country]')).toHaveValue('ZA');
		await expect(page.locator('select[name=currency]')).toHaveValue('ZAR');
		await expect(page.locator('select[name=timezone]')).toHaveValue('Africa/Johannesburg');
	});

	// Owners often set up a DZ while away from it: the timezone follows the chosen country
	// (main zone + a "check this" hint when it has several) until the owner picks one.
	test('timezone follows the chosen country until the owner picks one', async ({ page }) => {
		await page.goto('/signup');
		await page.getByLabel('Full name').fill('Tess Travel');
		await page.getByLabel('Email').fill(`e2e-tzc-${Date.now()}-${test.info().project.name}@example.com`);
		await page.getByLabel('Password').fill('blue-skies-123');
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page).toHaveURL(/\/app$/);
		await page.goto('/app/dropzones/new');
		const country = page.locator('select[name=country]');
		const tz = page.locator('select[name=timezone]');
		await expect(country).toHaveValue('ZA'); // hydrated (preselected from the browser zone)
		await country.selectOption('NA');
		await expect(tz).toHaveValue('Africa/Windhoek');
		await expect(page.getByText('has several timezones')).toHaveCount(0);
		await country.selectOption('US');
		await expect(tz).toHaveValue('America/New_York');
		await expect(page.getByText('United States has several timezones')).toBeVisible();
		await tz.selectOption('America/Denver');
		await expect(page.getByText('has several timezones')).toHaveCount(0);
		await country.selectOption('ZA');
		await expect(tz).toHaveValue('America/Denver');
		await country.selectOption('US');
		await page.getByLabel('Dropzone name').fill(`Skydive TZ ${test.info().project.name} ${Date.now()}`);
		await page.getByRole('button', { name: 'Create dropzone' }).click();
		await expect(page).toHaveURL(/\/app$/);
		await page.goto('/app/settings');
		await expect(page.locator('select[name=timezone]')).toHaveValue('America/Denver');
	});
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
	// One "Find a dropzone" nudge (the banner with "Create one"), not a second one in the jumper card.
	await expect(page.getByRole('main').getByRole('link', { name: 'Find a dropzone' })).toHaveCount(1);
	await expect(page.getByTestId('jumper-dashboard').getByRole('link', { name: 'Find a dropzone' })).toHaveCount(0);

	// Create a dropzone so the staff navigation + switcher are populated.
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Skydive E2E ${test.info().project.name} ${Date.now()}`);
	// Country is a named picker (no more typed codes); currency follows it until the owner
	// picks one (retry: needs hydration).
	const country = page.locator('select[name=country]');
	const currency = page.locator('select[name=currency]');
	await expect(country.locator('option[value="ZA"]')).toHaveText('South Africa');
	await expect(async () => {
		await country.selectOption('NA');
		await country.selectOption('ZA');
		await expect(currency).toHaveValue('ZAR', { timeout: 1000 });
	}).toPass();
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
	// The icon-only Display button (phones) keeps its accessible name.
	await expect(page.getByTestId('next-load').getByRole('link', { name: 'Display' })).toBeVisible();
	// Already a member: the jumper card doesn't nudge them to find a dropzone.
	await expect(page.getByTestId('jumper-dashboard').getByRole('link', { name: 'Find a dropzone' })).toHaveCount(0);
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
