import { expect, test } from '@playwright/test';

const CSV = [
	'No.,Date,DZ,Plane,Exit alt,FF,Discipline,Notes',
	'1,09/03/2024,Skydive E2E,C208,12000,60,Belly,"First solo, stable exit"',
	'2,10/03/2024,Skydive E2E,C208,12000,0:55,Freefly,ff',
	'x,not a date,,,,,,'
].join('\n');

test('logbook CSV import: map columns → preview → import → history → export', async ({ page }) => {
	const email = `import-${Date.now()}-${test.info().project.name}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Ivy Import');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);

	await page.goto('/app/import');
	await expect(page.getByRole('heading', { name: 'Import your logbook' })).toBeVisible();
	// Connector card renders either the sign-in form or the "unavailable" note, never a password field with a name.
	await expect(page.getByTestId('connector-card')).toBeVisible();
	await expect(page.locator('input[name="password"]')).toHaveCount(0);

	// Template download
	const template = await page.request.get('/app/import/template.csv');
	expect(await template.text()).toContain('Jump #,Date,Dropzone');

	await page.getByTestId('import-file').setInputFiles({ name: 'my-logbook.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
	const mapping = page.getByTestId('csv-mapping');
	await expect(mapping).toBeVisible();
	await mapping.getByRole('combobox').first().selectOption('dmy');
	await expect(mapping).toContainText('2 of the first 3 rows read');
	await page.getByTestId('upload-submit').click();

	await expect(page).toHaveURL(/staged=/);
	await expect(page.getByTestId('count-jumps')).toHaveText('2');
	await expect(page.getByTestId('import-preview')).toContainText('2024-03-09');
	await expect(page.getByTestId('import-preview')).toContainText('unreadable date');
	await page.getByTestId('import-confirm').click();

	await expect(page).toHaveURL(/job=/);
	await expect(page.getByTestId('import-result')).toContainText('Import complete');
	await expect(page.getByTestId('result-jumps')).toHaveText('2');
	await expect(page.getByTestId('job-history')).toContainText('succeeded');
	await page.screenshot({ path: `test-results/import-${test.info().project.name}.png`, fullPage: true });

	// Export: CSV + bundle contain the imported jumps
	await page.goto('/app/export');
	await expect(page.getByTestId('export-json')).toBeVisible();
	const csv = await (await page.request.get('/app/export/logbook.csv')).text();
	expect(csv).toContain('2024-03-09,Skydive E2E,C208,12000,60,belly');
	const bundle = await (await page.request.get('/app/export/me.json')).json();
	expect(bundle.format).toBe('slot-bundle');
	expect(bundle.jumper.jumps).toHaveLength(2);

	// Dropzone import/export are owner-only; federation linking is offered only when configured.
	expect((await page.request.get('/app/settings/import')).status()).toBe(403);
	expect((await page.request.get('/app/export/dropzone.json')).status()).toBe(403);
	await page.goto('/app/settings/linked-accounts');
	await expect(page.getByRole('heading', { name: 'Linked accounts' })).toBeVisible();
});
