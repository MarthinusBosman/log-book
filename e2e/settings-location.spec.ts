import { expect, test, type Page } from '@playwright/test';
import { gapBelowTopBar } from './anchors.ts';

/** Dropzone settings → Location: pasted pairs / map links fill both fields, "Use my location", no-JS paste. */

async function ownerWithDz(page: Page) {
	const email = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Lou Location');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Location DZ ${test.info().project.name} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	return email;
}

test.use({ permissions: ['geolocation'], geolocation: { latitude: -33.80123, longitude: 19.88456 } });

test('location: paste a Google Maps pair or link into one field, use my location, save', async ({ page, browser }) => {
	const email = await ownerWithDz(page);
	// The setup checklist asks for the pin and lands on the Location card (not under the top bar).
	const pinStep = page.getByTestId('setup-checklist').getByRole('link', { name: /Pin your location/ });
	await expect(pinStep).toHaveAttribute('href', '/app/settings#location');
	await expect(page.getByTestId('setup-checklist')).toContainText('0 of 8 done');
	await pinStep.click();
	await expect(page).toHaveURL(/\/app\/settings#location$/);
	await expect.poll(() => gapBelowTopBar(page, 'location')).toBeGreaterThanOrEqual(8);
	await page.goto('/app/settings');
	await page.waitForLoadState('networkidle');
	const lat = page.getByLabel('Latitude');
	const lng = page.getByLabel('Longitude');
	await expect(page.getByTestId('coords-map')).toHaveCount(0);

	// The pair as Google Maps copies it, pasted into Latitude
	await lat.fill('-33.0286, 18.1667');
	await expect(lat).toHaveValue('-33.0286');
	await expect(lng).toHaveValue('18.1667');
	await expect(page.getByTestId('coords-map')).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=-33.0286&mlon=18.1667#map=15/-33.0286/18.1667');

	// A map link pasted into Longitude: the pin wins over the map centre
	await lng.fill('https://www.google.com/maps/place/DZ/@-33.1,18.2,14z/data=!3m1!4b1!4m6!3m5!3d-33.5!4d18.75');
	await expect(lat).toHaveValue('-33.5');
	await expect(lng).toHaveValue('18.75');

	// A single number with a decimal comma is just that field
	await lat.fill('-33,25');
	await expect(lat).toHaveValue('-33,25');
	await expect(lng).toHaveValue('18.75');

	// Typed key by key, the pair is split once the field is left (not cut off mid-number)
	await lng.fill('');
	await lat.fill('');
	await lat.pressSequentially('-33.9654, 22.4567');
	await expect(lat).toHaveValue('-33.9654, 22.4567');
	await expect(lng).toHaveValue('');
	await lat.blur();
	await expect(lat).toHaveValue('-33.9654');
	await expect(lng).toHaveValue('22.4567');

	// Degrees/minutes/seconds as the Google Maps place panel shows them
	await lng.fill(`33°57'55.4"S 22°27'24.1"E`);
	await expect(lat).toHaveValue('-33.965389');
	await expect(lng).toHaveValue('22.456694');

	await page.getByRole('button', { name: 'Use my location' }).click();
	await expect(lat).toHaveValue('-33.80123');
	await expect(lng).toHaveValue('19.88456');

	await page.getByRole('button', { name: 'Save details' }).click();
	await expect(page.locator('[aria-live]').getByText(/saved/i).first()).toBeVisible();
	await page.reload();
	await expect(lat).toHaveValue('-33.80123');
	await expect(lng).toHaveValue('19.88456');
	await page.goto('/app');
	await expect(page.getByTestId('setup-checklist')).toContainText('1 of 8 done');

	// Without JS the server splits the pasted pair
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	const nojs = await ctx.newPage();
	await nojs.goto('/login');
	await nojs.getByLabel('Email').fill(email);
	await nojs.getByLabel('Password').fill('blue-skies-123');
	await nojs.locator('input[name=password]').press('Enter');
	await expect(nojs).toHaveURL(/\/app/);
	await nojs.goto('/app/settings');
	await expect(nojs.getByRole('button', { name: 'Use my location' })).toHaveCount(0);
	await nojs.getByLabel('Latitude').fill('33.0286° S, 18.1667° E');
	await nojs.getByLabel('Longitude').fill('');
	await nojs.getByRole('button', { name: 'Save details' }).click();
	await expect(nojs.getByTestId('no-js-outcome')).toContainText('Dropzone details saved');
	await nojs.goto('/app/settings');
	await expect(nojs.getByLabel('Latitude')).toHaveValue('-33.0286');
	await expect(nojs.getByLabel('Longitude')).toHaveValue('18.1667');
	await ctx.close();
});
