import { expect, test, type Page } from '@playwright/test';

/** Click whichever copy (desktop sidebar / mobile bar) of a booking button is visible. */
async function clickVisible(page: Page, testIds: string[]) {
	const sel = testIds.map((id) => `[data-testid="${id}"]:visible`).join(', ');
	await page.locator(sel).first().click();
}

async function drawSignature(page: Page, canvasIndex = 0) {
	const canvas = page.locator('[data-testid="sign-form"] canvas').nth(canvasIndex);
	await canvas.scrollIntoViewIfNeeded();
	const box = (await canvas.boundingBox())!;
	await page.mouse.move(box.x + 30, box.y + box.height / 2);
	await page.mouse.down();
	for (let i = 1; i < 25; i++) await page.mouse.move(box.x + 30 + i * 8, box.y + box.height / 2 + (i % 4 < 2 ? 18 : -18));
	await page.mouse.up();
}

test('tandems: slots + waiver setup → public booking → indemnity → staff view', async ({ page, request }) => {
	const project = test.info().project.name;
	const stamp = `${project}-${Date.now()}`;
	const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

	// Owner signs up and creates a dropzone.
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Tara Tandem');
	await page.getByLabel('Email').fill(`tandems-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Tandem DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// Booking slot for tomorrow.
	await page.goto('/app/tandems/slots');
	await page.getByLabel('Date').fill(tomorrow);
	await page.getByLabel('Time').fill('10:00');
	await page.getByLabel('Places').fill('3');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(page.locator('[data-testid="slot-day"]').first()).toContainText('10:00');

	// Tandem waiver: one checkbox section, then activate.
	await page.goto('/app/waivers?tab=tandem');
	await page.getByTestId('add-section-tandem').click();
	await page.getByLabel('Heading').fill('Assumption of risk');
	await page.locator('form[action="?/add"] select[name=type]').selectOption('acknowledgement');
	await page.locator('form[action="?/add"] textarea[name=content]').fill('I accept that skydiving is risky.');
	await page.getByRole('button', { name: 'Add section' }).click();
	await expect(page.getByTestId('section')).toHaveCount(1);
	await page.getByTestId('toggle-tandem').click();
	await expect(page.getByText('Active', { exact: true })).toBeVisible();

	// Find the public booking link.
	await page.goto('/app/tandems');
	const href = await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href');
	expect(href).toBeTruthy();
	const slug = href!.split('/')[2];

	// Public booking (logged out context is not required — the page is public).
	await page.goto(`/dz/${slug}`);
	await page.getByTestId('book-cta').click();
	await expect(page).toHaveURL(new RegExp(`/dz/${slug}/book`));
	await page.locator(`[data-date="${tomorrow}"]`).click();
	await page.locator('[data-time="10:00"]').click();
	await clickVisible(page, ['next', 'next-mobile']);

	await page.locator('input[name=j0_name]').fill('Pat Passenger');
	await page.locator('input[name=j0_email]').fill('pat@example.com');
	await page.locator('input[name=j0_phone]').fill('0820001111');
	await page.locator('input[name=j0_dob]').fill('1990-05-05');
	await page.locator('input[name=j0_weightKg]').fill('72');
	await page.locator('input[name=j0_emergencyName]').fill('Sam Contact');
	await page.locator('input[name=j0_emergencyPhone]').fill('0820002222');
	await clickVisible(page, ['next', 'next-mobile']);

	await page.getByTestId('terms').check();
	await clickVisible(page, ['confirm', 'confirm-mobile']);
	await expect(page).toHaveURL(new RegExp(`/dz/${slug}/book/[A-Z0-9]{4}-[A-Z0-9]{4}`));
	const conf = (await page.getByTestId('conf').textContent())!.trim();
	expect(conf).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

	// Step 4: sign the indemnity.
	await page.locator('input[name=ack_0]').check();
	await drawSignature(page);
	await page.getByTestId('sign-submit').click();
	await expect(page.getByTestId('ticket')).toContainText('Signed');

	// Customer PDF.
	const pdf = await request.get(`/dz/${slug}/book/${conf}/pdf`);
	expect(pdf.status()).toBe(200);
	expect(pdf.headers()['content-type']).toContain('application/pdf');

	// A group booking: the lead's page lists the other jumper and what the group owes.
	await page.goto('/app/pricelist');
	await page.waitForLoadState('networkidle');
	await page.locator('input[name=tandem_slot]').first().fill('3200');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.locator('[role=status], [data-sonner-toast], .toast, [aria-live]').filter({ hasText: 'Price list updated' }).first()).toBeVisible();
	await page.goto(`/dz/${slug}/book`);
	// Calendar days have a spoken date as their name, not the ISO string.
	const spoken = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${tomorrow}T00:00:00Z`));
	await expect(page.locator(`[data-date="${tomorrow}"]`)).toHaveAttribute('aria-label', new RegExp(`^${spoken}, \\d+ places? left$`));
	await page.locator(`[data-date="${tomorrow}"]`).click();
	await page.locator('[data-time="10:00"]').click();
	await page.getByRole('button', { name: 'More jumpers' }).click();
	await expect(page.getByTestId('count')).toHaveText('2');
	await clickVisible(page, ['next', 'next-mobile']);
	for (const [i, name] of ['Lee Lead', 'Max Mate'].entries()) {
		await page.locator(`input[name=j${i}_name]`).fill(name);
		await page.locator(`input[name=j${i}_email]`).fill(`j${i}@example.com`);
		await page.locator(`input[name=j${i}_phone]`).fill('0820001111');
		await page.locator(`input[name=j${i}_dob]`).fill('1991-06-06');
		await page.locator(`input[name=j${i}_weightKg]`).fill('70');
	}
	await page.locator('input[name=j0_emergencyName]').fill('Sam Contact');
	await page.locator('input[name=j0_emergencyPhone]').fill('0820002222');
	await clickVisible(page, ['next', 'next-mobile']);
	// Extras toggles (if the DZ prices any) say which jumper they are for.
	for (const label of await page.locator('[data-extra$="-1"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))) {
		expect(label).toMatch(/^Add .+ for Max Mate$/);
	}
	await page.getByTestId('terms').check();
	await clickVisible(page, ['confirm', 'confirm-mobile']);
	await expect(page).toHaveURL(/\?(.+&)?g=[A-Z0-9]{4}-[A-Z0-9]{4}/);
	await expect(page.getByTestId('group-due')).toHaveCount(1);
	await expect(page.getByTestId('group-due')).toContainText(/3[\s ,.]?200[.,]00 due/);
	await expect(page.getByTestId('group-total')).toContainText('Group total due · 2 jumpers');
	await expect(page.getByTestId('group-total')).toContainText(/6[\s ,.]?400/);

	// Staff sees the booking in the day list and drawer.
	await page.goto(`/app/tandems?day=${tomorrow}`);
	const row = page.getByTestId('tandem-row').filter({ hasText: 'Pat Passenger' });
	await expect(row).toContainText('Indemnity signed');
	await row.click();
	await expect(page.getByTestId('confirmation-number')).toHaveText(conf);
	// Detail lists hold only terms/definitions; their titles are headings outside the <dl>.
	const drawer = page.locator('dialog[open]');
	await expect(drawer.getByRole('heading', { name: 'Emergency contact' })).toBeVisible();
	await expect(drawer.locator('dl > :not(dt, dd, div)')).toHaveCount(0);

	// Signed waiver is listed with a PDF.
	await page.goto('/app/waivers?tab=signed');
	await expect(page.getByTestId('signed-row').filter({ hasText: 'Pat Passenger' })).toBeVisible();
});
