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

	// Phone bottom bar: the jump day + time stays whole next to the confirm button (it used to be
	// cut to "Thu 19 Nov 1…").
	const summary = page.getByTestId('bar-summary');
	if (await summary.isVisible()) {
		const vp = page.viewportSize()!;
		await page.setViewportSize({ width: 360, height: vp.height }); // small Android phone
		await expect(summary).toContainText('10:00');
		const clipped = await summary.evaluate((p) =>
			[p, ...p.querySelectorAll('*')].some((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth)
		);
		expect(clipped).toBe(false);
		await page.setViewportSize(vp);
	}

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
	// Submitting unsigned marks the pad itself (not just a toast); drawing clears the mark.
	await page.getByTestId('sign-submit').click();
	const pad = page.locator('[data-testid="sign-form"] [data-pad="signature"]');
	await expect(pad.getByTestId('signature-error')).toHaveText('Please sign in the signature box.');
	await expect(pad.locator('canvas')).toHaveAttribute('aria-invalid', 'true');
	await expect(pad.locator('canvas')).toHaveAccessibleDescription('Please sign in the signature box.');
	await drawSignature(page);
	await expect(pad.getByTestId('signature-error')).toHaveCount(0);
	await expect(pad.locator('canvas')).not.toHaveAttribute('aria-invalid', 'true');
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
	// Only the lead must give an email + mobile (a parent booking for the kids): Max leaves them empty.
	await expect(page.getByTestId('contact-optional')).toHaveCount(1);
	for (const [i, name] of ['Lee Lead', 'Max Mate'].entries()) {
		await page.locator(`input[name=j${i}_name]`).fill(name);
		if (i === 0) {
			await page.locator(`input[name=j${i}_email]`).fill(`j${i}@example.com`);
			await page.locator(`input[name=j${i}_phone]`).fill('0820001111');
		}
		await page.locator(`input[name=j${i}_dob]`).fill('1991-06-06');
		await page.locator(`input[name=j${i}_weightKg]`).fill('70');
	}
	await expect(page.getByTestId('contact-optional')).toHaveText('No email or mobile? Max’s indemnity link is in your confirmation to pass on.');
	await expect(page.getByLabel('Email (optional)')).toHaveValue('');
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
	// Nothing owed: the payment field starts empty. A booking with a price pre-fills what is
	// outstanding the way prices are written ("3 200", not "3200.00").
	await expect(page.getByTestId('pay-amount')).toHaveValue('');
	await page.goto(`/app/tandems?day=${tomorrow}`);
	await page.getByTestId('tandem-row').filter({ hasText: 'Lee Lead' }).click();
	const leeDrawer = page.locator('dialog[open]');
	await expect(leeDrawer.getByTestId('pay-amount')).toHaveValue('3 200');
	// The grouped value posts as R 3 200: marking it paid leaves nothing outstanding.
	await page.waitForLoadState('networkidle');
	await leeDrawer.getByRole('button', { name: 'Mark payment' }).click();
	await expect(page.locator('[aria-live]').filter({ hasText: 'Tandem payment has been updated' }).first()).toBeVisible();
	await expect(leeDrawer.getByTestId('pay-amount')).toHaveValue('');
	await expect(leeDrawer.getByTestId('no-email-hint')).toHaveCount(0);
	// Max Mate left email and mobile empty: Resend is off and the drawer says to send the link instead.
	await page.goto(`/app/tandems?day=${tomorrow}`);
	await page.getByTestId('tandem-row').filter({ hasText: 'Max Mate' }).click();
	const maxDrawer = page.locator('dialog[open]');
	await expect(maxDrawer.getByRole('button', { name: 'Resend confirmation' })).toBeDisabled();
	await expect(maxDrawer.getByTestId('no-email-hint')).toHaveText(/^No email on file: (share|copy) the link and send it by WhatsApp or SMS\.$/);
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

	await page.goto('/app/tandems');
	const href = await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href');
	const slug = href!.split('/')[2];

	// No booking times and no contact details yet: no dead-end "Book a tandem" (it led to an empty
	// calendar priced R 0,00), and no "Get in touch" without a way to.
	await page.goto(`/dz/${slug}`);
	await expect(page.getByTestId('no-booking-times')).toHaveText('Online booking isn’t open yet. Check back soon.');
	await expect(page.getByTestId('book-cta')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Book a tandem' })).toHaveCount(0);
	await page.goto(`/dz/${slug}/book`);
	await expect(page.getByTestId('no-booking-times')).toContainText('Check back soon');
	await expect(page.locator('[data-date]')).toHaveCount(0);

	await page.goto('/app/settings');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Phone').fill('+27 21 555 0123');
	// Hours without open days used to be saved but never shown ("Open by appointment").
	await page.getByLabel('Opens').fill('08:00');
	await page.getByLabel('Closes').fill('17:30');
	await page.getByRole('button', { name: 'Save details' }).click();
	await expect(page.getByText('Tick the days you’re open, or clear the opening hours.').first()).toBeVisible();
	await expect(page.getByLabel('Opens')).toHaveValue('08:00');
	for (const d of ['Wed', 'Sat', 'Sun']) await page.locator(`input[name=openDays][value=${d.toLowerCase()}]`).check({ force: true });
	await page.getByRole('button', { name: 'Save details' }).click();
	await expect(page.getByText('Dropzone details saved').first()).toBeVisible();

	// With a phone number the empty booking page points at it instead.
	await page.goto(`/dz/${slug}/book`);
	await expect(page.getByTestId('no-booking-times')).toContainText('Call or email Hours DZ');
	await expect(page.getByTestId('no-booking-times').locator('a[href^="tel:"]')).toHaveText('+27 21 555 0123');

	for (const url of [`/dz/${slug}`, `/app/dropzones/${slug}`]) {
		await page.goto(url);
		// The colour-coded grid is hidden from screen readers; a sentence says which days are open.
		await expect(page.getByTestId('open-days-grid')).toHaveAttribute('aria-hidden', 'true');
		await expect(page.locator('main .sr-only', { hasText: 'Open Wednesday, Saturday and Sunday' })).toHaveCount(1);
		await expect(page.locator('main').getByText('08:00 – 17:30').first()).toBeVisible();
		await expect(page.locator('main a[href^="tel:"]').first()).toHaveAttribute('href', 'tel:+27215550123');
	}
});

test('booking: the time picker is one tab stop and arrow keys move between times', async ({ page }) => {
	const stamp = `${test.info().project.name}-${Date.now()}`;
	const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Kay Keys');
	await page.getByLabel('Email').fill(`keys-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Keys DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/tandems/slots');
	for (const t of ['09:00', '11:00', '14:00']) {
		await page.getByLabel('Date', { exact: true }).fill(tomorrow);
		await page.getByLabel('Time', { exact: true }).fill(t);
		await page.getByLabel('Places', { exact: true }).fill('2');
		await page.getByRole('button', { name: 'Add slots' }).click();
		await expect(page.locator('[data-testid="slot-day"]').first()).toContainText(t);
	}
	await page.goto('/app/tandems');
	const href = await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href');

	await page.goto(href!);
	await page.waitForLoadState('networkidle');
	await page.locator(`[data-date="${tomorrow}"]`).click();
	const group = page.getByRole('radiogroup', { name: 'Time' });
	const radios = group.getByRole('radio');
	await expect(radios).toHaveCount(3);
	// Nothing picked yet: only the first time is in the tab order.
	await expect(group.locator('[tabindex="0"]')).toHaveCount(1);
	await expect(radios.nth(0)).toHaveAttribute('tabindex', '0');
	await radios.nth(0).focus();
	await page.keyboard.press('ArrowRight');
	await expect(radios.nth(1)).toBeFocused();
	await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
	await expect(radios.nth(1)).toHaveAttribute('tabindex', '0');
	await expect(radios.nth(0)).toHaveAttribute('tabindex', '-1');
	await page.keyboard.press('End');
	await expect(radios.nth(2)).toBeFocused();
	await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
	// Wraps around.
	await page.keyboard.press('ArrowDown');
	await expect(radios.nth(0)).toBeFocused();
	await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true');
	// Tab leaves the group in one step.
	await page.keyboard.press('Tab');
	await expect(radios.nth(1)).not.toBeFocused();
	await expect(group.locator(':focus')).toHaveCount(0);

	// A group bigger than a time's places: picking that time keeps the group size (it used to drop
	// jumpers silently) and says so, with a one-tap way to book what fits.
	await page.reload();
	await page.waitForLoadState('networkidle');
	await page.locator(`[data-date="${tomorrow}"]`).click();
	await page.getByRole('button', { name: 'More jumpers' }).click();
	await page.getByRole('button', { name: 'More jumpers' }).click();
	await expect(page.getByTestId('count')).toHaveText('3');
	await page.locator('[data-time="11:00"]').click();
	await expect(page.getByTestId('count')).toHaveText('3');
	await expect(page.getByTestId('too-few')).toContainText('Only 2 places left at 11:00 for your group of 3.');
	await page.getByTestId('too-few').getByRole('button', { name: 'book 2 jumpers at 11:00' }).click();
	await expect(page.getByTestId('count')).toHaveText('2');
	await expect(page.getByTestId('too-few')).toHaveCount(0);
});

test('booking: the calendar is one tab stop and arrow keys move between bookable days', async ({ page }) => {
	const stamp = `${test.info().project.name}-${Date.now()}`;
	const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
	const [d1, d2, d8] = [day(1), day(2), day(8)];
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Cal Keys');
	await page.getByLabel('Email').fill(`calkeys-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Cal DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/tandems/slots');
	for (const [i, d] of [d1, d2, d8].entries()) {
		await page.getByLabel('Date', { exact: true }).fill(d);
		await page.getByLabel('Time', { exact: true }).fill('10:00');
		await page.getByLabel('Places', { exact: true }).fill('2');
		await page.getByRole('button', { name: 'Add slots' }).click();
		await expect(page.locator('[data-testid="slot-day"]')).toHaveCount(i + 1);
	}
	await page.goto('/app/tandems');
	const href = await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href');

	await page.goto(href!);
	await page.waitForLoadState('networkidle');
	const cal = page.getByTestId('calendar');
	const dayBtn = (d: string) => cal.locator(`[data-date="${d}"]`);
	// Only the first bookable day is in the tab order.
	await expect(cal.locator('[data-date][tabindex="0"]')).toHaveCount(1);
	await expect(dayBtn(d1)).toHaveAttribute('tabindex', '0');
	await dayBtn(d1).focus();
	// Arrows move focus (switching month if needed) without selecting.
	await page.keyboard.press('ArrowRight');
	await expect(dayBtn(d2)).toBeFocused();
	await expect(dayBtn(d2)).toHaveAttribute('aria-pressed', 'false');
	await expect(dayBtn(d2)).toHaveAttribute('tabindex', '0');
	await page.keyboard.press('ArrowLeft');
	await expect(dayBtn(d1)).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(dayBtn(d8)).toBeFocused();
	// Enter selects the focused day and shows its times.
	await page.keyboard.press('Enter');
	await expect(dayBtn(d8)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('radiogroup', { name: 'Time' }).getByRole('radio')).toHaveCount(1);
});

test('booking: Continue marks every missing field at once; too young shows inline, no guardian fields', async ({ page }) => {
	const stamp = `${test.info().project.name}-${Date.now()}`;
	const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Val Idate');
	await page.getByLabel('Email').fill(`valid-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Valid DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/tandems/slots');
	await page.getByLabel('Date', { exact: true }).fill(tomorrow);
	await page.getByLabel('Time', { exact: true }).fill('10:00');
	await page.getByLabel('Places', { exact: true }).fill('2');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(page.locator('[data-testid="slot-day"]').first()).toContainText('10:00');
	await page.goto('/app/tandems');
	const href = await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href');
	// Contact details for the over-the-limit message.
	await page.goto('/app/settings');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Phone').fill('+27 21 555 0199');
	await page.getByLabel('Email').first().fill(`valid-dz-${stamp}@example.com`);
	await page.getByRole('button', { name: 'Save details' }).click();
	await expect(page.getByText('Dropzone details saved').first()).toBeVisible();

	await page.goto(href!);
	await page.waitForLoadState('networkidle');
	await page.locator(`[data-date="${tomorrow}"]`).click();
	await page.locator('[data-time="10:00"]').click();
	await clickVisible(page, ['next', 'next-mobile']);
	await expect(page.getByTestId('step-heading')).toHaveText('Who’s jumping?');

	// Empty Continue: every required field is marked with its own message, focus on the first.
	await clickVisible(page, ['next', 'next-mobile']);
	await expect(page.getByTestId('step-heading')).toHaveText('Who’s jumping?');
	const required = ['name', 'email', 'phone', 'dob', 'weightKg', 'emergencyName', 'emergencyPhone'];
	for (const f of required) {
		const input = page.locator(`input[name=j0_${f}]`);
		await expect(input).toHaveAttribute('aria-invalid', 'true');
		await expect(input).toHaveAccessibleDescription(/.+/);
	}
	await expect(page.locator('input[name=j0_heightCm]')).not.toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('input[name=j0_name]')).toBeFocused();
	// Typing in a field clears just its mark.
	await page.locator('input[name=j0_name]').fill('Young Pat');
	await expect(page.locator('input[name=j0_name]')).not.toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('input[name=j0_email]')).toHaveAttribute('aria-invalid', 'true');

	// Under the minimum age: the reason shows under the date of birth right away, and no
	// guardian fields appear (a guardian can't make it possible).
	const [y, m, d] = tomorrow.split('-').map(Number);
	const tenYearsOld = `${y - 10}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	await page.locator('input[name=j0_dob]').fill(tenYearsOld);
	await expect(page.locator('input[name=j0_dob]')).toHaveAccessibleDescription(/at least 12/);
	await expect(page.locator('input[name=j0_guardianName]')).toHaveCount(0);
	// 16: allowed with a guardian; the age message goes away.
	await page.locator('input[name=j0_dob]').fill(`${y - 16}-01-01`);
	await expect(page.locator('input[name=j0_dob]')).not.toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('input[name=j0_guardianName]')).toBeVisible();

	// Over the weight limit: one message, under the field, straight away (not repeated in the
	// amber notes box); that box keeps only soft notes such as the height range.
	const notes = page.locator('fieldset[data-step="1"] p[role=status]');
	await page.locator('input[name=j0_weightKg]').fill('130');
	await expect(page.locator('input[name=j0_weightKg]')).toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('input[name=j0_weightKg]')).toHaveAccessibleDescription('The tandem weight limit is 100 kg');
	await expect(page.locator('fieldset[data-step="1"]')).not.toContainText('130 kg is over');
	// …with the dropzone's own phone and email right there to do so.
	const contact = page.getByTestId('weight-contact');
	await expect(contact).toHaveText(`Talk to Valid DZ ${stamp} first: call +27 21 555 0199 or email valid-dz-${stamp}@example.com.`);
	await expect(contact.locator('a[href^="tel:"]')).toHaveText('+27 21 555 0199');
	await expect(contact.locator('a[href^="mailto:"]')).toHaveAttribute('href', `mailto:valid-dz-${stamp}@example.com`);
	await page.locator('input[name=j0_heightCm]').fill('210');
	await expect(notes).toHaveText('Height 210 cm is outside 140–200 cm.');
	await expect(notes).not.toContainText('Weight');
	// Close to the limit is a soft note, not an error.
	await page.locator('input[name=j0_weightKg]').fill('98');
	await expect(page.locator('input[name=j0_weightKg]')).not.toHaveAttribute('aria-invalid', 'true');
	await expect(contact).toHaveCount(0);
	await expect(notes).toContainText('Weight 98 kg is close to the 100 kg limit');
});

// New dropzones take their country (and so currency) from the browser timezone: pin it so CI (UTC) quotes rand too.
test.describe('South African dropzone', () => {
	test.use({ timezoneId: 'Africa/Johannesburg' });

	test('booking without a tandem price: staff are told, customers see "Price at the dropzone", not R 0,00', async ({ page }) => {
		const stamp = `${test.info().project.name}-${Date.now()}`;
		const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
		await page.goto('/signup');
		await page.getByLabel('Full name').fill('Una Priced');
		await page.getByLabel('Email').fill(`unpriced-${stamp}@example.com`);
		await page.getByLabel('Password').fill('blue-skies-123');
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page).toHaveURL(/\/app$/);
		await page.goto('/app/dropzones/new');
		await page.getByLabel('Dropzone name').fill(`Unpriced DZ ${stamp}`);
		await page.getByRole('button', { name: 'Create dropzone' }).click();
		await expect(page).toHaveURL(/\/app$/);
		await page.goto('/app/tandems/slots');
		await expect(page.getByTestId('no-tandem-price')).toContainText('No tandem price yet');
		await expect(page.getByTestId('no-tandem-price').getByRole('link', { name: 'Set prices' })).toHaveAttribute('href', '/app/pricelist');
		await page.getByLabel('Date', { exact: true }).fill(tomorrow);
		await page.getByLabel('Time', { exact: true }).fill('10:00');
		await page.getByLabel('Places', { exact: true }).fill('2');
		await page.getByRole('button', { name: 'Add slots' }).click();
		await expect(page.locator('[data-testid="slot-day"]').first()).toContainText('10:00');
		await page.goto('/app/tandems');
		const href = (await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href'))!;

		const visibleTotal = page.locator('[data-testid="total"]:visible, [data-testid="bar-total"]:visible').first();
		await page.goto(href);
		await page.waitForLoadState('networkidle');
		await expect(visibleTotal).toHaveText('Price at the dropzone');
		await page.locator(`[data-date="${tomorrow}"]`).click();
		await page.locator('[data-time="10:00"]').click();
		await clickVisible(page, ['next', 'next-mobile']);
		await page.locator('input[name=j0_name]').fill('Pat Unpriced');
		await page.locator('input[name=j0_email]').fill('pat-unpriced@example.com');
		await page.locator('input[name=j0_phone]').fill('0820001111');
		await page.locator('input[name=j0_dob]').fill('1990-05-05');
		await page.locator('input[name=j0_weightKg]').fill('72');
		await page.locator('input[name=j0_emergencyName]').fill('Sam Contact');
		await page.locator('input[name=j0_emergencyPhone]').fill('0820002222');
		await clickVisible(page, ['next', 'next-mobile']);
		await expect(page.getByTestId('step-heading')).toHaveText('Make it yours');
		await page.getByTestId('terms').check();
		await clickVisible(page, ['confirm', 'confirm-mobile']);
		await expect(page).toHaveURL(/\/book\/[A-Z0-9]{4}-[A-Z0-9]{4}/);
		// The confirmation page doesn't print "Total R 0,00 · Balance R 0,00" either.
		await expect(page.getByTestId('booking-total')).toHaveText('Price at the dropzone');

		// Staff don't see the unpriced booking as "Paid" / "Deposit paid".
		await page.goto(`/app/tandems?day=${tomorrow}`);
		await expect(page.getByTestId('row-no-price')).toHaveCount(1);
		const rowHref = (await page.getByTestId('tandem-row').first().getAttribute('href'))!;
		const passengerId = new URLSearchParams(rowHref.split('?')[1]).get('p')!;
		await page.goto(`/app/tandems/${passengerId}`);
		const detail = page.getByTestId('tandem-detail');
		await expect(detail.getByText('No price', { exact: true }).first()).toBeVisible();
		await expect(detail.getByText('Paid', { exact: true })).toHaveCount(0);
		await expect(page.getByTestId('no-price')).toContainText('no Tandem jump price yet');

		// Once the DZ prices a tandem the note goes and the booking page quotes it.
		await page.goto('/app/pricelist');
		await page.waitForLoadState('networkidle');
		await page.locator('input[name=tandem_slot]').first().fill('3200');
		await page.getByRole('button', { name: 'Save all' }).first().click();
		await expect(page.locator('[aria-live]').filter({ hasText: 'Price list updated' }).first()).toBeVisible();
		await page.goto('/app/tandems/slots');
		await expect(page.getByRole('heading', { name: 'Booking slots', exact: true })).toBeVisible();
		await expect(page.getByTestId('no-tandem-price')).toHaveCount(0);
		await page.goto(href);
		await page.waitForLoadState('networkidle');
		await expect(visibleTotal).toHaveText(/R\s?3\s?200,00/);

		// The early booking can now take today's price.
		await page.goto(`/app/tandems/${passengerId}`);
		await page.waitForLoadState('networkidle');
		const usePrice = page.getByRole('button', { name: /Use current price · R\s?3\s?200,00/ });
		await expect(usePrice).toBeVisible();
		await usePrice.click();
		await expect(page.locator('[aria-live]').filter({ hasText: 'Price added to the booking' }).first()).toBeVisible();
		await expect(page.getByTestId('no-price')).toHaveCount(0);
		await expect(detail.getByText('Unpaid', { exact: true })).toBeVisible();
	});
});

test('slots: dates months ahead stay listed and say when customers can book them', async ({ page }) => {
	const stamp = `${test.info().project.name}-${Date.now()}`;
	const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
	const [d60, d120] = [day(60), day(120)];
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Far Ahead');
	await page.getByLabel('Email').fill(`farahead-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Far DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/tandems/slots');
	await page.waitForLoadState('networkidle');
	const toasts = page.locator('[aria-live]');
	// 60 days out: past the old 45-day list, but bookable now (no "opens" note).
	await page.getByLabel('Date', { exact: true }).fill(d60);
	await page.getByLabel('Time', { exact: true }).fill('10:00');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(toasts.filter({ hasText: '1 slot added.' }).first()).toBeVisible();
	await expect(toasts.filter({ hasText: 'opens for booking' })).toHaveCount(0);
	await expect(page.getByTestId('slot-day')).toHaveCount(1);
	await expect(page.getByTestId('opens-on')).toHaveCount(0);
	// 120 days out: listed, with the day it appears on the booking page.
	await page.getByLabel('Date', { exact: true }).fill(d120);
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(toasts.filter({ hasText: 'It opens for booking on' }).first()).toBeVisible();
	await expect(page.getByTestId('slot-day')).toHaveCount(2);
	await expect(page.getByTestId('slot-day').nth(1).getByTestId('opens-on')).toContainText('Bookable from');
	await expect(page.getByText('Customers can book up to 90 days ahead.')).toBeVisible();
	// The far one can be removed from the list.
	await page.getByRole('button', { name: `Remove ${d120} 10:00` }).click();
	await expect(page.getByTestId('slot-day')).toHaveCount(1);
	// With more than 14 days listed, a far-off day just added still shows (marked) without "Show all".
	await page.getByLabel('Date', { exact: true }).fill(day(1));
	await page.getByLabel('Repeat').selectOption('daily');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(toasts.filter({ hasText: '30 slots added.' }).first()).toBeVisible();
	await expect(page.getByTestId('slot-day')).toHaveCount(14);
	await page.getByLabel('Date', { exact: true }).fill(d120);
	await page.getByLabel('Repeat').selectOption('none');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(page.getByTestId('slot-day')).toHaveCount(15);
	await expect(page.getByTestId('slot-day').last().getByTestId('just-added')).toBeVisible();
	await expect(page.getByTestId('slot-day').last().getByTestId('opens-on')).toContainText('Bookable from');
	await expect(page.getByRole('link', { name: 'Show all 32 days' })).toBeVisible();
});

test('slots: a time that has already passed today is refused, repeats start on the next date', async ({ page }) => {
	const stamp = `${test.info().project.name}-${Date.now()}`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Past Times');
	await page.getByLabel('Email').fill(`pasttimes-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Past DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/tandems/slots');
	await page.waitForLoadState('networkidle');
	const toasts = page.locator('[aria-live]');
	const dateInput = page.getByLabel('Date', { exact: true });
	// The dropzone's today (the field's min); 00:00 today is always over.
	const today = (await dateInput.getAttribute('min'))!;
	await dateInput.fill(today);
	await page.getByLabel('Time', { exact: true }).fill('00:00');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(toasts.filter({ hasText: '00:00 today has already passed. Pick a later time or another day.' }).first()).toBeVisible();
	await expect(page.getByTestId('slot-day')).toHaveCount(0);
	// Weekly from today: today's passed time is skipped, the other four weeks are added.
	await page.getByLabel('Repeat').selectOption('weekly');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(toasts.filter({ hasText: '4 slots added. Today’s 00:00 has already passed, so they start' }).first()).toBeVisible();
	await expect(page.getByTestId('slot-day')).toHaveCount(4);
	await expect(page.getByTestId('slot-day').filter({ hasText: 'Today' })).toHaveCount(0);
});

test('booking: paying at the dropzone doesn’t promise a deposit that is never taken', async ({ page }) => {
	const stamp = `${test.info().project.name}-${Date.now()}`;
	const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
	await page.goto('/signup');
	await page.getByLabel('Full name').fill('Dee Deposit');
	await page.getByLabel('Email').fill(`deposit-${stamp}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Deposit DZ ${stamp}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/pricelist');
	await page.waitForLoadState('networkidle');
	await page.locator('input[name=tandem_slot]').first().fill('3200');
	await page.locator('input[name=tandem_deposit]').first().fill('500');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.getByText('Price list updated')).toBeVisible();
	await page.goto('/app/tandems/slots');
	await page.getByLabel('Date', { exact: true }).fill(tomorrow);
	await page.getByLabel('Time', { exact: true }).fill('10:00');
	await page.getByLabel('Places', { exact: true }).fill('2');
	await page.getByRole('button', { name: 'Add slots' }).click();
	await expect(page.locator('[data-testid="slot-day"]').first()).toContainText('10:00');
	await page.goto('/app/tandems');
	const href = await page.getByRole('link', { name: /\/dz\/.+\/book$/ }).getAttribute('href');

	await page.goto(href!);
	await page.waitForLoadState('networkidle');
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
	await expect(page.getByTestId('step-heading')).toHaveText('Make it yours');
	// No online payment connected: only "Pay at the dropzone", which takes no deposit. The page used
	// to say "A deposit of R 500,00 per jumper secures your place" (and list a Deposit row) anyway.
	await expect(page.getByTestId('terms')).toBeVisible();
	expect(await page.getByTestId('deposit-note').count()).toBe(0);
	expect(await page.getByTestId('pay-deposit').count()).toBe(0);
	await expect(page.locator('main')).not.toContainText('secures your place');
	await expect(page.getByTestId('due-now')).toContainText('pay at the DZ');
	await expect(page.locator('aside dt', { hasText: 'Deposit' })).toHaveCount(0);
});
