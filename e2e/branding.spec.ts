import { expect, test, type Browser, type Page } from '@playwright/test';

/** Profile pictures (JS + no-JS) and per-dropzone branding (colour, logo, public theme). */

// 8×8 orange PNG (decodable by browsers, so the client-side re-encode path runs).
const PNG_4PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAE0lEQVR4nGP8n8WAFTBhFx6sEgAfTAF5dxho6gAAAABJRU5ErkJggg==', 'base64');

async function signup(page: Page, name: string) {
	const email = `brand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	return email;
}

async function loginNoJs(browser: Browser, email: string) {
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	const page = await ctx.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: /log in|sign in/i }).click();
	await expect(page).toHaveURL(/\/app/);
	return { ctx, page };
}

test('profile photo: dashboard prompt, upload/change/remove with JS, HEIC message, works without JS', async ({ page, browser }) => {
	const email = await signup(page, 'Pat Photo');

	// Dashboard nudges for a photo; "Not now" hides it for good
	await expect(page.getByTestId('photo-prompt')).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByTestId('photo-prompt-dismiss').click();
	await expect(page.getByTestId('photo-prompt')).toHaveCount(0);
	await page.reload();
	await expect(page.getByTestId('photo-prompt')).toHaveCount(0);

	// Clear control on the profile
	await page.goto('/app/profile');
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('avatar-choose')).toHaveText(/Upload photo/);
	await page.getByTestId('avatar-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_4PX });
	await expect(page.getByTestId('profile-avatar')).toHaveAttribute('src', /\/app\/profile\/avatar\//);
	await expect(page.getByTestId('avatar-choose')).toHaveText(/Change photo/);
	// …and it's the user's avatar in the app shell too (sidebar or mobile top bar)
	const src = await page.getByTestId('profile-avatar').getAttribute('src');
	await expect(page.locator(`header img[src="${src}"], aside img[src="${src}"]`).first()).toBeAttached();
	// Re-encoded in the browser (WebP where supported)
	const type = await page.evaluate(async (u) => (await fetch(u!)).headers.get('content-type'), src);
	expect(type).toMatch(/image\/(webp|jpeg)/);

	// HEIC the browser can't decode: friendly message, nothing uploaded
	await page.getByTestId('avatar-input').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('not really heic') });
	await expect(page.getByTestId('avatar-upload')).toContainText('HEIC');
	await expect(page.getByTestId('profile-avatar')).toHaveAttribute('src', src!);

	await page.getByTestId('avatar-remove').click();
	await expect(page.getByTestId('profile-avatar')).toHaveCount(0);
	await expect(page.getByTestId('avatar-choose')).toHaveText(/Upload photo/);

	// Without JavaScript: pick a file → "Save photo" appears → plain multipart POST
	const { ctx, page: nojs } = await loginNoJs(browser, email);
	await nojs.goto('/app/profile');
	await expect(nojs.getByTestId('avatar-save')).toBeHidden();
	await nojs.getByTestId('avatar-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_4PX });
	await nojs.getByTestId('avatar-save').click();
	await expect(nojs.getByTestId('form-success')).toContainText('Profile picture has been updated');
	await expect(nojs.getByTestId('profile-avatar')).toBeVisible();
	// Server-side checks still apply without JS
	await nojs.getByTestId('avatar-input').setInputFiles({ name: 'IMG_1.heic', mimeType: 'image/heic', buffer: Buffer.from('heic') });
	await nojs.getByTestId('avatar-save').click();
	await expect(nojs.getByTestId('form-error')).toContainText('HEIC');
	await ctx.close();
});

test('dropzone branding: colour with contrast warning, logo, public theme, reset', async ({ page, browser }) => {
	await signup(page, 'Bea Brand');
	const dzName = `Brand DZ ${test.info().project.name} ${Date.now()}`;
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(dzName);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/settings');
	const slug = await page.locator('input[name=slug]').inputValue();

	await page.goto('/app/settings/branding');
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('branding-preview')).toBeVisible();
	await page.getByTestId('color-hex').fill('#FF6A00');
	await expect(page.getByTestId('contrast-warning')).toContainText('light backgrounds');
	await page.locator('input[name=theme][value=light]').check({ force: true });
	await page.getByTestId('branding-save').click();
	await expect(page.locator('style#dz-brand')).toBeAttached();
	expect(await page.locator('style#dz-brand').textContent()).toContain('--dz-primary:#ff6a00');

	// SSR: present on first paint after a reload, and on the public pages
	await page.reload();
	await expect(page.locator('style#dz-brand')).toBeAttached();

	// Logo → app shell + public page
	await page.getByTestId('logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_4PX });
	await expect(page.getByTestId('logo-preview')).toBeVisible();
	await expect(page.getByTestId('dz-logo').first()).toBeAttached();

	// A visitor without a theme cookie gets the DZ's default (light) on its public page
	const visitor = await browser.newContext();
	const v = await visitor.newPage();
	await v.goto(`/dz/${slug}`);
	await expect(v.locator('html')).not.toHaveClass(/dark/);
	await expect(v.locator('style#dz-brand')).toBeAttached();
	await expect(v.getByTestId('dz-logo')).toBeVisible();
	const logo = await v.getByTestId('dz-logo').getAttribute('src');
	const res = await v.request.get(logo!);
	expect(res.status()).toBe(200);
	expect(res.headers()['cache-control']).toContain('immutable');
	await visitor.close();

	// Reset → back to the app defaults
	await page.getByTestId('branding-reset').click();
	await expect(page.locator('style#dz-brand')).toHaveCount(0);
	await expect(page.getByTestId('logo-preview')).toHaveCount(0);
});
