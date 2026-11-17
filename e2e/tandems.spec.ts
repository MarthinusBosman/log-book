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

test('tandems: slots + waiver setup → public booking → indemnity → staff view', async ({ page, request, browser }) => {
	test.setTimeout(90_000); // the whole customer + staff journey; 30 s was tight under full-suite load
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
	await page.locator('form[action^="?/add"] select[name=type]').selectOption('acknowledgement');
	await page.locator('form[action^="?/add"] textarea[name=content]').fill('I accept that skydiving is risky.');
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
	await expect(page.getByTestId('step-heading')).toHaveText('Who’s jumping?');
	await expect(page.getByTestId('step-heading')).toBeFocused();

	await page.locator('input[name=j0_name]').fill('Pat Passenger');
	await page.locator('input[name=j0_email]').fill('pat@example.com');
	await page.locator('input[name=j0_phone]').fill('0820001111');
	await page.locator('input[name=j0_dob]').fill('1990-05-05');
	await page.locator('input[name=j0_weightKg]').fill('72');
	await page.locator('input[name=j0_emergencyName]').fill('Sam Contact');
	await page.locator('input[name=j0_emergencyPhone]').fill('0820002222');
	// Each step change moves focus to the new heading (the pressed button is replaced, so focus
	// would otherwise fall back to <body> and screen readers hear nothing).
	const heading = page.getByTestId('step-heading');
	await clickVisible(page, ['next', 'next-mobile']);
	await expect(heading).toHaveText('Make it yours');
	await expect(heading).toBeFocused();
	await page.getByRole('button', { name: 'Back' }).locator('visible=true').first().click();
	await expect(heading).toHaveText('Who’s jumping?');
	await expect(heading).toBeFocused();
	await clickVisible(page, ['next', 'next-mobile']);
	await expect(heading).toBeFocused();

	await page.getByTestId('terms').check();
	await clickVisible(page, ['confirm', 'confirm-mobile']);
	await expect(page).toHaveURL(new RegExp(`/dz/${slug}/book/[A-Z0-9]{4}-[A-Z0-9]{4}`));
	await expect(page.locator('[role=status]').filter({ hasText: 'Booking confirmed' }).first()).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/dz/${slug}/book/[A-Z0-9]{4}-[A-Z0-9]{4}$`)); // ?new=1 dropped
	const conf = (await page.getByTestId('conf').textContent())!.trim();
	expect(conf).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

	// "I'll sign later" ↔ "Sign now": the pressed button is swapped out, so focus moves to the
	// replacement (not <body>). Without JS the same buttons are links (?later=1).
	await page.waitForLoadState('networkidle');
	await page.getByTestId('sign-later').click();
	await expect(page.getByTestId('sign-later-note')).toBeVisible();
	await expect(page.getByTestId('sign-now')).toBeFocused();
	await expect(page).not.toHaveURL(/later=1/);
	await page.getByTestId('sign-now').click();
	await expect(page.getByRole('heading', { name: 'Sign your indemnity' })).toBeFocused();
	await expect(page.getByTestId('sign-form')).toBeVisible();
	{
		const ctx = await browser.newContext({ javaScriptEnabled: false });
		const nojs = await ctx.newPage();
		await nojs.goto(page.url());
		await nojs.getByTestId('sign-later').click();
		await expect(nojs).toHaveURL(/[?&]later=1#indemnity$/);
		await expect(nojs.getByTestId('sign-later-note')).toBeVisible();
		await expect(nojs.getByTestId('sign-form')).toHaveCount(0);
		await nojs.getByTestId('sign-now').click();
		await expect(nojs).not.toHaveURL(/later=1/);
		await expect(nojs.getByTestId('sign-form')).toBeVisible();
		await ctx.close();
	}

	// Step 4: sign the indemnity.
	await page.locator('input[name=ack_0]').check();
	// The pad spans the form (a stray col-span once squeezed it to ~140 px on desktop).
	const formBox = (await page.getByTestId('sign-form').boundingBox())!;
	const padBox = (await page.locator('[data-testid="sign-form"] canvas').first().boundingBox())!;
	expect(padBox.width).toBeGreaterThan(formBox.width * 0.8);
	await drawSignature(page);
	await page.getByTestId('sign-submit').click();
	await expect(page.getByTestId('ticket')).toContainText('Signed');

	// Customer PDF.
	const pdf = await request.get(`/dz/${slug}/book/${conf}/pdf`);
	expect(pdf.status()).toBe(200);
	expect(pdf.headers()['content-type']).toContain('application/pdf');

	// "Booking confirmed" toasts once: leaving the page in-app and coming BACK must not repeat it
	// (a shallow URL clean-up used to restore ?new=1 on back, firing the toast every visit).
	const confirmed = page.locator('[role=status], [aria-live]').filter({ hasText: 'Booking confirmed' });
	await expect(confirmed).toHaveCount(0, { timeout: 8000 });
	await page.waitForLoadState('networkidle');
	await page.locator(`header a[href="/dz/${slug}"]`).first().click();
	await expect(page).toHaveURL(new RegExp(`/dz/${slug}$`));
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(`/dz/${slug}/book/${conf}$`));
	await expect(page.getByTestId('conf')).toBeVisible();
	await page.waitForTimeout(500);
	await expect(confirmed).toHaveCount(0);

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
	// On a phone the fellow jumper's confirmation number wraps under the amount instead of being cut off.
	const desktop = page.viewportSize();
	await page.setViewportSize({ width: 390, height: 844 });
	const code = page.getByTestId('group-code');
	await expect(code).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
	expect(await code.evaluate((el) => el.getBoundingClientRect().right <= el.parentElement!.parentElement!.getBoundingClientRect().right + 0.5)).toBe(true);
	// Download PDF and the DZ link stack as two equal full-width buttons instead of a ragged wrap.
	const links = await page.getByTestId('booking-links').evaluate((box) => [...box.children].map((a) => a.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.width)]));
	expect(links).toHaveLength(2);
	expect(links[1]).toEqual(links[0]);
	if (desktop) await page.setViewportSize(desktop);
	// Copy link never fails silently: with the clipboard denied (or missing, as on a plain-http
	// self-host) and no legacy copy, the link is shown in a prompt to copy by hand.
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
		document.execCommand = () => false;
	});
	// Handle the prompt inside the listener: an open prompt blocks the click from resolving.
	const shown = new Promise<[string, string]>((resolve) =>
		page.once('dialog', (d) => {
			resolve([d.message(), d.defaultValue()]);
			void d.dismiss();
		})
	);
	await page.getByRole('button', { name: "Copy Max Mate's indemnity link" }).click();
	const [message, value] = await shown;
	expect(message).toBe("Copy Max Mate's indemnity link");
	expect(value).toMatch(/^https?:\/\/[^/]+\/dz\/[^/]+\/book\/[A-Z0-9]{4}-[A-Z0-9]{4}#indemnity$/);
	// On a phone with a share sheet the button shares the link (WhatsApp etc.) instead of copying.
	await page.addInitScript(() => {
		const w = window as unknown as { __shared: ShareData[] };
		w.__shared = [];
		Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: ShareData) => void w.__shared.push(d) });
		const mm = window.matchMedia.bind(window);
		window.matchMedia = (q: string) => (q === '(pointer: coarse)' ? ({ matches: true, media: q } as MediaQueryList) : mm(q));
	});
	await page.reload();
	await page.getByRole('button', { name: "Share Max Mate's indemnity link" }).click();
	await expect(page.getByTestId('group-share')).toHaveText('Share link');
	const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
	expect(shared).toHaveLength(1);
	expect(shared[0].url).toBe(value);
	expect(shared[0].text).toContain('Max Mate, please sign your indemnity');
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
	// In the drawer the name sits under the dialog title (h2); as a full page it is the h1.
	await expect(drawer.getByRole('heading', { level: 2, name: 'Pat Passenger' })).toBeVisible();
	// Staff on a phone share the customer's booking link (share sheet still stubbed from above).
	await expect(drawer.getByTestId('reg-link')).toHaveText('Share link');
	await drawer.getByTestId('reg-link').click();
	const sharedReg = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
	expect(sharedReg).toHaveLength(1);
	expect(sharedReg[0].url).toMatch(new RegExp(`/dz/[^/]+/book/${conf}$`));
	expect(sharedReg[0].text).toContain('Pat Passenger, here is your tandem booking');
	await drawer.getByRole('link', { name: 'Open as full page →' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Pat Passenger' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Emergency contact' })).toHaveCount(0);
	await expect(page.getByRole('heading', { level: 3, name: 'Emergency contact' })).toBeVisible();

	// Signed waiver is listed with a PDF.
	await page.goto('/app/waivers?tab=signed');
	await expect(page.getByTestId('signed-row').filter({ hasText: 'Pat Passenger' })).toBeVisible();
	// Changing the form filter keeps search text that wasn't submitted yet.
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Search signed waivers').fill('Pat');
	await page.getByLabel('Form', { exact: true }).selectOption('sport');
	await expect(page).toHaveURL(/[?&]q=Pat(&|$)/);
	await expect(page).toHaveURL(/[?&]audience=sport/);
	await expect(page.getByLabel('Search signed waivers')).toHaveValue('Pat');
	await expect(page.getByTestId('signed-row').filter({ hasText: 'Pat Passenger' })).toHaveCount(0);
	await page.getByLabel('Form', { exact: true }).selectOption('tandem');
	await expect(page).toHaveURL(/[?&]audience=tandem/);
	await expect(page.getByTestId('signed-row').filter({ hasText: 'Pat Passenger' })).toBeVisible();

	// On a phone a deep link to a later tab scrolls the tab strip so the active tab shows.
	const viewport = page.viewportSize();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/app/waivers?tab=jumpers');
	await page.waitForLoadState('networkidle');
	const strip = page.getByRole('navigation', { name: 'Waiver sections' });
	const inView = () =>
		strip.evaluate((nav) => {
			const a = nav.querySelector('[aria-current="page"]')!.getBoundingClientRect();
			const n = nav.getBoundingClientRect();
			return nav.scrollWidth > nav.clientWidth && a.left >= n.left && a.right <= n.right;
		});
	await expect.poll(inView).toBe(true);

	// Same for the tandem day strip: a deep link to the Sunday of the week shows that day.
	await page.goto(`/app/tandems?day=${tomorrow}`);
	const days = page.getByRole('navigation', { name: 'Days' });
	const sunday = await days.locator('a').nth(6).getAttribute('href');
	await page.goto(sunday!);
	await page.waitForLoadState('networkidle');
	const dayInView = () =>
		days.evaluate((nav) => {
			const a = nav.querySelector('[aria-current="date"]')!.getBoundingClientRect();
			const n = nav.getBoundingClientRect();
			return nav.scrollWidth > nav.clientWidth && a.left >= n.left && a.right <= n.right;
		});
	await expect.poll(dayInView).toBe(true);
	if (viewport) await page.setViewportSize(viewport);

	// Cancelling a booking asks first: Cancel keeps it, the confirm cancels it.
	await page.goto(`/app/tandems?day=${tomorrow}`);
	await page.waitForLoadState('networkidle');
	await page.getByTestId('tandem-row').filter({ hasText: 'Pat Passenger' }).click();
	const cancel = page.locator('dialog[open]').getByTestId('cancel-booking');
	await expect(cancel.getByRole('button', { name: 'Cancel booking' })).toBeHidden();
	await cancel.locator('summary').click();
	await expect(cancel).toContainText('Cancel Pat Passenger’s booking?');
	await cancel.getByRole('link', { name: 'Cancel' }).click();
	await expect(cancel.getByRole('button', { name: 'Cancel booking' })).toBeHidden();
	await expect(page.locator('dialog[open]').getByRole('button', { name: 'Reset tandem' })).toHaveCount(0);
	await cancel.locator('summary').click();
	await cancel.getByRole('button', { name: 'Cancel booking' }).click();
	await expect(page.locator('dialog[open]').getByRole('button', { name: 'Reset tandem' })).toBeVisible();
	await expect(page.locator('dialog[open]').getByTestId('cancel-booking')).toHaveCount(0);

	// Booking slots page: tabs + remove-a-booked-slot question live in the URL (with JS).
	await page.goto('/app/tandems/slots');
	await page.waitForLoadState('networkidle');
	const tabs = page.getByRole('navigation', { name: 'Add slots by' });
	await tabs.getByRole('link', { name: 'Every week' }).click();
	await expect(page.getByRole('button', { name: 'Add weekly slot' })).toBeVisible();
	await expect(page).toHaveURL(/[?&]mode=weekly/);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Add weekly slot' })).toBeVisible();
	await tabs.getByRole('link', { name: 'By date' }).click();
	await expect(page.getByRole('button', { name: 'Add slots' })).toBeVisible();
	await expect(page).not.toHaveURL(/mode=/);
	const removeX = page.getByRole('link', { name: `Remove ${tomorrow} 10:00` });
	await removeX.click();
	const ask = page.getByTestId('remove-slot-confirm');
	await expect(ask).toContainText(/bookings? at 10:00 will keep/);
	await expect(page).toHaveURL(/[?&]remove=/);
	await ask.getByRole('link', { name: 'Cancel' }).click();
	await expect(ask).toHaveCount(0);
	await expect(page).not.toHaveURL(/remove=/);

	// Without JS: tab link, then the booked slot's x asks first and Remove slot removes it.
	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const p2 = await noJs.newPage();
	await p2.goto('/app/tandems/slots');
	await p2.getByRole('navigation', { name: 'Add slots by' }).getByRole('link', { name: 'Every week' }).click();
	await expect(p2.getByRole('button', { name: 'Add weekly slot' })).toBeVisible();
	await p2.getByRole('navigation', { name: 'Add slots by' }).getByRole('link', { name: 'By date' }).click();
	// Places: nothing submits on change without JS, so a Save shows while the field has focus.
	const places = p2.getByRole('spinbutton', { name: 'Places at 10:00' });
	const save = p2.getByRole('button', { name: 'Save places at 10:00' });
	await expect(save).toBeHidden();
	await places.fill('5');
	await expect(save).toBeVisible();
	await save.click();
	await expect(p2.getByText('Capacity updated')).toBeVisible();
	await expect(places).toHaveValue('5');
	// With JS the change submits by itself: no Save button at all.
	await expect(page.getByTestId('capacity-save')).toHaveCount(0);
	await p2.getByRole('link', { name: `Remove ${tomorrow} 10:00` }).click();
	await expect(p2.getByTestId('remove-slot-confirm')).toBeVisible();
	await p2.getByTestId('remove-slot-confirm').getByRole('link', { name: 'Cancel' }).click();
	await expect(p2.getByTestId('remove-slot-confirm')).toHaveCount(0);
	await expect(p2.locator('[data-testid="slot-day"]').filter({ hasText: '10:00' })).toHaveCount(1);
	await p2.getByRole('link', { name: `Remove ${tomorrow} 10:00` }).click();
	await p2.getByRole('button', { name: 'Remove slot' }).click();
	await expect(p2.getByText('Slot removed')).toBeVisible();
	await expect(p2.getByRole('link', { name: `Remove ${tomorrow} 10:00` })).toHaveCount(0);
	await noJs.close();
});

test('public dropzone page: opening days have a text alternative, phone link dials', async ({ page }) => {
	const stamp = `${test.info().project.name}-${Date.now()}`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Hettie Hours');
	await page.getByLabel('Email').fill(`hours-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Hours DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	await page.goto('/app/settings');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Phone').fill('+27 21 555 0123');
	for (const d of ['Wed', 'Sat', 'Sun']) await page.locator(`input[name=openDays][value=${d.toLowerCase()}]`).check({ force: true });
	await page.getByRole('button', { name: 'Save details' }).click();
	await expect(page.getByText('Dropzone details saved').first()).toBeVisible();

	await page.goto('/app/tandems');
	const href = await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href');
	const slug = href!.split('/')[2];

	for (const url of [`/dz/${slug}`, `/app/dropzones/${slug}`]) {
		await page.goto(url);
		// The colour-coded grid is hidden from screen readers; a sentence says which days are open.
		await expect(page.getByTestId('open-days-grid')).toHaveAttribute('aria-hidden', 'true');
		await expect(page.locator('main .sr-only', { hasText: 'Open Wednesday, Saturday and Sunday' })).toHaveCount(1);
		await expect(page.locator('main a[href^="tel:"]').first()).toHaveAttribute('href', 'tel:+27215550123');
	}
});
