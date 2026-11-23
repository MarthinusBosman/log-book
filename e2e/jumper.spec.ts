import { expect, test, type Page } from '@playwright/test';
import { gapBelowTopBar } from './anchors.ts';

/** Jumper area main flow on a fresh database: own DZ → check in → logbook → gear → profile → teams → wallet. */
async function signup(page: Page, name: string) {
	const email = `jumper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Full name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
	return email;
}

test('jumper: check in, log + edit a jump, export, gear, profile, team, wallet', async ({ page, browser }) => {
	const project = test.info().project.name;
	await signup(page, 'Jo Jumper');
	await expect(page.getByTestId('jumper-dashboard')).toBeVisible();

	// A dropzone to jump at (the creator is owner + can check in like anyone else)
	const dzName = `Skydive Jumper E2E ${project} ${Date.now()}`;
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(dzName);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// Directory + detail
	await page.goto('/app/dropzones');
	await page.getByTestId('dz-search').fill(dzName);
	await page.getByTestId('dz-search').press('Enter');
	await page.locator('main').getByRole('link', { name: dzName }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(dzName);
	await page.getByTestId('follow').click();
	await expect(page.getByTestId('follow')).toContainText('Following');

	// Check in
	await page.getByTestId('dz-checkin').click();
	await expect(page).toHaveURL(/\/app\/check-in/);
	await page.getByLabel('Exit weight (kg)').fill('88');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toContainText(dzName);

	// Logbook: add a jump (number prefilled), then edit it
	await page.goto('/app/logbook');
	await page.getByTestId('log-jump').first().click();
	await expect(page).toHaveURL(/\/app\/logbook\/new/);
	await expect(page.getByLabel('Jump #')).toHaveValue('1');
	await page.getByLabel('Aircraft').fill('Cessna 182');
	await page.getByLabel('Altitude (ft)').fill('10000');
	await page.getByLabel('Freefall (sec)').fill('0:45');
	await page.getByText('Freeflying', { exact: true }).click();
	await page.getByLabel('Description').fill('First freefly jump');
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]+$/);
	await expect(page.getByText('Jump has been added')).toBeVisible();
	await page.getByLabel('Altitude (ft)').fill('12000');
	await page.getByTestId('save-jump').click();
	await expect(page.getByText('Jump info updated')).toBeVisible();

	// Sign-off link + QR
	await page.getByTestId('create-sign-link').click();
	await expect(page.getByTestId('sign-link').getByRole('img', { name: 'Sign jump' })).toBeVisible();
	// "Share link" only where there's a share sheet worth opening (phones); desktops have Copy.
	const hasSheet = await page.evaluate(() => typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches);
	await expect(page.getByTestId('share-sign-link')).toHaveCount(hasSheet ? 1 : 0);
	await page.addInitScript(() => {
		const w = window as unknown as { __shared: ShareData[] };
		w.__shared = [];
		Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: ShareData) => void w.__shared.push(d) });
		const mm = window.matchMedia.bind(window);
		window.matchMedia = (q: string) => (q === '(pointer: coarse)' ? ({ matches: true, media: q } as MediaQueryList) : mm(q));
	});
	await page.reload();
	await page.waitForLoadState('networkidle');
	await page.getByTestId('create-sign-link').click();
	await page.getByTestId('share-sign-link').click();
	const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
	expect(shared).toHaveLength(1);
	expect(shared[0].url).toBe(await page.getByLabel('Sign-off link').inputValue());
	expect(shared[0].text).toMatch(/^Please sign my jump #\d+ on /);

	// List + CSV export
	await page.goto('/app/logbook');
	await expect(page.getByTestId('jump-card')).toHaveCount(1);
	await expect(page.getByTestId('jump-card')).toContainText('12 000 ft');
	await expect(page.getByTestId('logbook-breakdown')).toBeVisible();
	await expect(page.getByTestId('breakdown-scope')).toHaveCount(0);
	// The long dropzone name on the jump card truncates instead of widening the page on a phone
	expect(await page.evaluate(() => innerWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

	// Breakdown tabs are ?by= links: switch in place with JS, survive reload, stay off CSV/Print
	const tabs = page.getByTestId('breakdown-tabs');
	await expect(tabs.getByRole('link', { name: 'Type' })).toHaveAttribute('aria-current', 'true');
	await tabs.getByRole('link', { name: 'Year' }).click();
	await expect(tabs.getByRole('link', { name: 'Year' })).toHaveAttribute('aria-current', 'true');
	await expect(page.getByTestId('logbook-breakdown')).toContainText(String(new Date().getFullYear()));
	await expect(page).toHaveURL(/[?&]by=year/);
	await page.reload();
	await expect(tabs.getByRole('link', { name: 'Year' })).toHaveAttribute('aria-current', 'true');
	await expect(page.getByTestId('export-csv')).toHaveAttribute('href', '/app/logbook/export.csv');
	{
		const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
		const p = await noJs.newPage();
		await p.goto('/app/logbook');
		const t = p.getByTestId('breakdown-tabs');
		await t.getByRole('link', { name: 'Dropzone' }).click();
		await expect(p).toHaveURL(/[?&]by=dz/);
		await expect(t.getByRole('link', { name: 'Dropzone' })).toHaveAttribute('aria-current', 'true');
		await p.getByTestId('logbook-filters').locator('input[name=q]').fill('freefly');
		await p.getByTestId('logbook-filters').locator('input[name=q]').press('Enter');
		await expect(p).toHaveURL(/[?&]q=freefly/);
		await expect(t.getByRole('link', { name: 'Dropzone' })).toHaveAttribute('aria-current', 'true');
		await t.getByRole('link', { name: 'Type' }).click();
		await expect(p).not.toHaveURL(/by=/);
		await expect(p).toHaveURL(/[?&]q=freefly/);
		await noJs.close();
	}
	const csv = await page.request.get('/app/logbook/export.csv');
	expect(csv.headers()['content-type']).toContain('text/csv');
	const body = await csv.text();
	expect(body).toContain('Jump #,Date');
	expect(body).toContain('First freefly jump');

	// Print sheet: a filtered print says which jumps it holds, and its stats cover just those
	await page.goto('/app/logbook/print');
	await expect(page.getByTestId('print-filter')).toHaveCount(0);
	await expect(page.getByTestId('print-stats')).toContainText('Total jumps');
	await page.goto('/app/logbook/print?type=freefly&q=nothing-matches');
	await expect(page.getByTestId('print-filter')).toHaveText('Only Freeflying jumps · matching “nothing-matches”');
	await expect(page.getByTestId('print-stats')).toContainText(/Printed\s*0/);
	await expect(page.getByTestId('print-stats')).toContainText(/Total jumps\s*1/);
	await page.goto('/app/logbook/print?type=freefly');
	await expect(page.getByTestId('print-stats')).toContainText(/Printed\s*1/);
	await expect(page.getByTestId('print-table').locator('tbody tr')).toHaveCount(1);

	// Gear: add a rig, wing loading computed live
	await page.goto('/app/my-gear/new');
	// Section headings (h3) sit under a card heading (h2), not straight under the page h1.
	await expect(page.getByRole('heading', { level: 2, name: 'Rig details' })).toBeVisible();
	await page.getByLabel('Container make & model *').fill('Javelin Odyssey');
	await page.getByLabel('Main canopy *').fill('Sabre3');
	await page.getByLabel('Size (sq ft)').first().fill('170');
	await page.getByLabel('Exit weight (kg)').fill('88');
	await expect(page.getByTestId('wing-loading')).toContainText('1.14');
	await page.getByLabel('Reserve canopy *').fill('PD 160');
	await page.getByLabel('Last repack date *').fill('2026-01-01');
	await page.getByTestId('save-rig').click();
	await expect(page).toHaveURL(/\/app\/my-gear\/[0-9a-f-]+/);
	await page.goto('/app/my-gear');
	await expect(page.getByTestId('rig-card')).toHaveCount(1);

	// Profile credentials
	await page.goto('/app/profile?tab=credentials');
	await page.getByLabel('Skydive association').selectOption('pasa');
	await page.getByLabel('Association number').fill('12345');
	await page.getByLabel('Membership expiry').fill('2030-01-01');
	await page.getByLabel('Licence number').fill('C-1');
	await page.getByRole('button', { name: 'Save credentials' }).click();
	await expect(page.getByText('Credentials updated successfully')).toBeVisible();

	// Team
	await page.goto('/app/team');
	await page.getByTestId('new-team').click();
	await page.getByLabel('Team name').fill('Sunset 4-way');
	// colour swatches are named radios (screen readers heard 8 unlabelled radios)
	await page.getByTestId('create-team').getByTitle('Green').click();
	await expect(page.getByTestId('create-team').getByRole('radio', { name: 'Green' })).toBeChecked();
	await page.getByRole('button', { name: 'Create team' }).click();
	await expect(page).toHaveURL(/\/app\/team\/[0-9a-f-]+/);
	await expect(page.getByTestId('team-members')).toContainText('Jo Jumper');
	await expect(page.getByTestId('team-settings').getByRole('radio', { name: 'Green' })).toBeChecked();
	await expect(page.getByTestId('team-settings').getByRole('radio', { name: 'Blue' })).not.toBeChecked();

	// Wallet: the new DZ has wallets off by default → friendly notice
	await page.goto('/app/wallet');
	await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeVisible();

	// Notifications
	await page.goto('/app/notifications');
	await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
	await page.screenshot({ path: `test-results/jumper-${project}.png`, fullPage: false });
});

test('self-manifest stops at boarding: the jumper can no longer join or leave', async ({ page }) => {
	const project = test.info().project.name;
	await signup(page, 'Bo Boarding');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Boarding E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// Two open loads
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-BRD');
	await dialog.getByLabel('Slots (pax)').fill('6');
	await dialog.getByLabel('Weight limit (kg)').fill('600');
	await dialog.getByLabel('Number of loads').fill('2');
	await dialog.getByRole('button', { name: 'Create 2 loads' }).click();
	await expect(page.locator('[data-testid=load-card][data-load-number="2"]')).toBeVisible();

	// Check in and join load 1 from the phone view
	await page.goto('/app/check-in');
	await page.getByLabel('Exit weight (kg)').fill('80');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toBeVisible();
	await page.waitForLoadState('networkidle');
	const load1 = page.locator('[data-testid=load-card][data-load="1"]');
	// same count as the dashboard's "N open now" (boarding/full/own loads aren't joinable)
	await expect(page.getByTestId('loads-summary')).toHaveText('2 open to join');
	const load2Id = new URLSearchParams(
		(await page.locator('[data-testid=load-card][data-load="2"]').getByTestId('join-solo').getAttribute('href'))!.slice(1)
	).get('join')!;
	await load1.getByTestId('join-solo').click();
	await load1.getByRole('button', { name: 'Join this load' }).click();
	await expect(load1.getByText('You’re on this load')).toBeVisible();
	await expect(page.getByTestId('loads-summary')).toHaveText('1 open to join');

	// Team jump with no team yet: just the way to a team (no jump type, price or dead button),
	// and the link opens the create form (it used to point at a 404).
	await page.locator('[data-testid=load-card][data-load="2"]').getByTestId('join-team').click();
	const noTeam = page.locator('[data-testid=load-card][data-load="2"]').getByTestId('no-team');
	await expect(noTeam).toBeVisible();
	await expect(page.locator('[data-testid=load-card][data-load="2"]').getByTestId('live-price')).toHaveCount(0);
	await noTeam.getByRole('link', { name: 'Create a team' }).click();
	await expect(page).toHaveURL(/\/app\/team\?new=1$/);
	await expect(page.getByTestId('create-team')).toBeVisible();

	// Manifest: 20 min call → boarding on both loads
	await page.goto('/app/manifest');
	for (const n of ['1', '2']) {
		const card = page.locator(`[data-testid=load-card][data-load-number="${n}"]`);
		for (const status of ['called', 'boarding']) {
			await card.getByTestId('next-step').click();
			await expect(card).toHaveAttribute('data-status', status);
		}
	}

	await page.goto('/app/check-in');
	await expect(load1.getByTestId('boarding-note')).toBeVisible();
	await expect(page.getByTestId('loads-summary')).toHaveText('2 today');
	await expect(load1.getByRole('button', { name: 'Leave' })).toHaveCount(0);
	const load2 = page.locator('[data-testid=load-card][data-load="2"]');
	await expect(load2.getByRole('button', { name: 'Boarding · ask manifest' })).toBeDisabled();
	await expect(load2.getByTestId('join-solo')).toHaveCount(0);

	// The server refuses it too (no-JS / stale page)
	const origin = new URL(page.url()).origin;
	const res = await page.request.post('/app/check-in?/join', {
		form: { loadId: load2Id, jumpType: 'belly' },
		headers: { origin, accept: 'application/json', 'x-sveltekit-action': 'true' }
	});
	expect(await res.text()).toContain('is boarding: ask manifest');
	await page.reload();
	await expect(load2.getByText('You’re on this load')).toHaveCount(0);
});

test('team jump works before hydration / without JS: members start ticked, switching team takes the chosen team', async ({ page, browser }) => {
	const project = test.info().project.name;
	await signup(page, 'Tia Teams');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`NoJS Team E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-TMS');
	await dialog.getByLabel('Slots (pax)').fill('6');
	await dialog.getByLabel('Weight limit (kg)').fill('600');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	await expect(page.locator('[data-testid=load-card][data-load-number="1"]')).toBeVisible();
	for (const name of ['Alpha 4-way', 'Bravo 4-way']) {
		await page.goto('/app/team?new=1');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('create-team').getByLabel('Team name').fill(name);
		await page.getByTestId('create-team').getByRole('button', { name: 'Create team' }).click();
		await expect(page).not.toHaveURL(/new=1/);
	}
	await page.goto('/app/check-in');
	await page.getByLabel('Exit weight (kg)').fill('80');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toBeVisible();
	const loadId = new URLSearchParams(
		(await page.locator('[data-testid=load-card][data-load="1"]').getByTestId('join-team').getAttribute('href'))!.slice(1)
	).get('team')!;

	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const p = await noJs.newPage();
	await p.goto(`/app/check-in?team=${loadId}`);
	const card = p.locator('[data-testid=load-card][data-load="1"]');
	// Server render: the first team's members are ticked, the price counts them, the button is live.
	await expect(card.locator('input[name=memberIds]').first()).toBeChecked();
	await expect(card.getByText(/^1 × /)).toBeVisible();
	await expect(card.getByRole('button', { name: 'Join load now' })).toBeEnabled();
	// Picking the other team without JS keeps the first team's (server-rendered) ticks: the
	// server takes the whole chosen team instead of refusing with "Select at least one".
	const select = card.getByLabel('Team', { exact: true });
	const first = (await select.locator('option').first().textContent())!;
	const other = (await select.locator('option').allTextContents()).find((t) => t !== first)!;
	await select.selectOption({ label: other });
	await card.getByRole('button', { name: 'Join load now' }).click();
	await expect(p.locator('[data-testid=load-card][data-load="1"]').getByText('You’re on this load')).toBeVisible();
	await noJs.close();
});

test('team page: a teammate added or removed after load updates who is ticked and the price', async ({ page, browser, baseURL }) => {
	const project = test.info().project.name;
	const buddyName = `Buddy ${project} ${Date.now()}`;
	const other = await browser.newContext({ baseURL });
	await signup(await other.newPage(), buddyName);
	await other.close();

	await signup(page, 'Tom Teamowner');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Team ticks E2E ${project} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-TCK');
	await dialog.getByLabel('Slots (pax)').fill('6');
	await dialog.getByLabel('Weight limit (kg)').fill('600');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	await expect(page.locator('[data-testid=load-card][data-load-number="1"]')).toBeVisible();
	await page.goto('/app/check-in');
	await page.getByLabel('Exit weight (kg)').fill('80');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toBeVisible();

	await page.goto('/app/team?new=1');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('create-team').getByLabel('Team name').fill('Tick 2-way');
	await page.getByTestId('create-team').getByRole('button', { name: 'Create team' }).click();
	await expect(page).toHaveURL(/\/app\/team\/[0-9a-f-]+$/);
	await page.waitForLoadState('networkidle');
	const form = page.getByTestId('manifest-team');
	await expect(form.getByTestId('team-price')).toHaveText(/^1 jumper × /);

	// Add the buddy without reloading: they start ticked like the rest of the team (they used to
	// stay unticked, so "Join load now" quietly left them off the load).
	await page.getByLabel('Search jumpers').fill(buddyName);
	await page.getByRole('button', { name: 'Find' }).click();
	await page.getByTestId('member-results').getByRole('button', { name: 'Add to team' }).click();
	await expect(page.getByTestId('team-members')).toContainText(buddyName);
	await expect(form.getByRole('checkbox', { name: buddyName })).toBeChecked();
	await expect(form.getByTestId('team-price')).toHaveText(/^2 jumpers × /);

	// Unticking still works, and removing a teammate drops them from the count.
	await form.getByText(buddyName).click();
	await expect(form.getByTestId('team-price')).toHaveText(/^1 jumper × /);
	await form.getByText(buddyName).click();
	await expect(form.getByTestId('team-price')).toHaveText(/^2 jumpers × /);
	const removeMate = page.getByTestId('remove-member');
	await removeMate.locator('summary').click();
	await removeMate.getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByTestId('team-members')).not.toContainText(buddyName);
	await expect(form.getByTestId('team-price')).toHaveText(/^1 jumper × /);
});

test('jump form marks every bad field at once and focuses the first (with and without JS)', async ({ page, browser }) => {
	await signup(page, 'Typo Prone');
	await page.goto('/app/logbook/new');
	await page.waitForLoadState('networkidle');
	// skip the browser's own checks so the server validation is what we see
	await page.getByTestId('jump-form').evaluate((f: HTMLFormElement) => (f.noValidate = true));
	await page.getByLabel('Location').fill('Skydive Test Field');
	await page.getByLabel('Altitude (ft)').fill('-50');
	await page.getByLabel('Freefall (sec)').fill('abc');
	await page.getByTestId('save-jump').click();
	await expect(page.getByTestId('form-error')).toHaveText('Please fix the 2 highlighted fields');
	const alt = page.getByLabel('Altitude (ft)');
	const ff = page.getByLabel('Freefall (sec)');
	await expect(alt).toHaveAttribute('aria-invalid', 'true');
	await expect(alt).toHaveAccessibleDescription("Altitude can't be negative");
	await expect(ff).toHaveAccessibleDescription('Freefall time must be seconds or mm:ss');
	await expect(alt).toBeFocused();
	await expect(page.getByLabel('Jump #')).not.toHaveAttribute('aria-invalid', 'true');
	await expect(page.getByLabel('Location')).toHaveValue('Skydive Test Field');
	await alt.fill('4000');
	await ff.fill('0:45');
	await page.getByLabel('Aircraft').fill('Cessna 206');
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]{36}(\?added=1)?$/);
	await expect(page.getByLabel('Freefall (sec)')).toHaveValue('45');
	// The next jump suggests the plane already in the logbook.
	await page.goto('/app/logbook/new');
	await expect(page.getByLabel('Aircraft')).toHaveAttribute('list', 'aircraft-suggestions');
	await expect(page.locator('#aircraft-suggestions option')).toHaveCount(1);
	await expect(page.locator('#aircraft-suggestions option')).toHaveAttribute('value', 'Cessna 206');
	// ...and starts from the last jump: same place, plane and altitude
	await expect(page.getByLabel('Location')).toHaveValue('Skydive Test Field');
	await expect(page.getByLabel('Aircraft')).toHaveValue('Cessna 206');
	await expect(page.getByLabel('Altitude (ft)')).toHaveValue('4000');

	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const plain = await noJs.newPage();
	await plain.goto('/app/logbook/new');
	await plain.getByLabel('Location').fill('Skydive Test Field');
	await plain.getByLabel('Freefall (sec)').fill('12:99');
	await plain.getByTestId('save-jump').click();
	await expect(plain.getByLabel('Freefall (sec)')).toHaveAccessibleDescription('Freefall time must be seconds or mm:ss');
	await expect(plain.getByTestId('form-error')).toHaveText('Freefall time must be seconds or mm:ss');
	await noJs.close();
});

async function addLicence(page: Page, licence: string) {
	await page.goto('/app/profile?tab=credentials');
	await page.getByLabel('Skydive association').selectOption('pasa');
	await page.getByLabel('Association number').fill('54321');
	await page.getByLabel('Membership expiry').fill('2030-01-01');
	await page.getByLabel('Licence number').fill(licence);
	await page.getByRole('button', { name: 'Save credentials' }).click();
	await expect(page.getByText('Credentials updated successfully')).toBeVisible();
}

test('profile: saving on the Credentials tab stays on that tab (with and without JS)', async ({ page, browser }) => {
	await signup(page, 'Tab Keeper');
	const tab = (p: Page) => p.getByRole('navigation', { name: 'Profile sections' }).locator('[aria-current=page]');
	await addLicence(page, 'B-7');
	// Kit 3 used to follow the action URL (no ?tab=) → bounced to Info after every save
	await expect(page).toHaveURL(/\/app\/profile\?tab=credentials$/);
	await expect(tab(page)).toHaveText('Credentials');
	await page.getByTestId('rating-form').getByLabel('Rating').fill('Coach');
	await page.getByTestId('rating-form').getByRole('button', { name: 'Add' }).click();
	await expect(page.getByTestId('ratings')).toContainText('Coach');
	await expect(page).toHaveURL(/\?tab=credentials$/);
	await expect(tab(page)).toHaveText('Credentials');

	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const plain = await noJs.newPage();
	await plain.goto('/app/profile?tab=credentials');
	await plain.getByTestId('rating-form').getByLabel('Rating').fill('Packer');
	await plain.getByTestId('rating-form').getByRole('button', { name: 'Add' }).click();
	await expect(tab(plain)).toHaveText('Credentials');
	await expect(plain.getByTestId('ratings')).toContainText('Packer');
	await noJs.close();
});

test('logbook hints: out-of-order dates and duplicate numbers are pointed out, not blocked', async ({ page }) => {
	await signup(page, 'Paper Logbook');
	async function add(no: string, date: string) {
		await page.goto('/app/logbook/new');
		await page.getByLabel('Jump #').fill(no);
		await page.getByLabel('Date').fill(date);
		await page.getByLabel('Location').fill('Skydive Test Field');
		await page.getByTestId('save-jump').click();
		await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]+$/);
		return page.url();
	}
	const five = await add('5', '2026-06-27');
	await expect(page.getByTestId('jump-hints')).toHaveCount(0);
	const six = await add('6', '2026-06-11');
	const hints = page.getByTestId('jump-hints');
	await expect(hints).toContainText('Dated before jump #5');
	await hints.getByRole('link', { name: 'jump #5' }).click();
	await expect(page).toHaveURL(five);
	await expect(page.getByTestId('jump-hints')).toContainText('Dated after jump #6');
	// fixing the date clears the hint
	await page.goto(six);
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Date').fill('2026-06-28');
	await page.getByTestId('save-jump').click();
	await expect(page.getByTestId('jump-hints')).toHaveCount(0);
	// a second #6 on the same day is a duplicate
	await add('6', '2026-06-28');
	await expect(page.getByTestId('jump-hints')).toContainText('You have another jump #6');
	await expect(page.getByTestId('jump-hints')).not.toContainText('Dated');
});

test('recording an AAD service asks for the next due date and moves it — also without JS', async ({ page, browser }) => {
	await signup(page, 'Aad Owner');
	await page.goto('/app/my-gear/new');
	await page.getByLabel('Container make & model *').fill('Javelin Odyssey');
	await page.getByLabel('Main canopy *').fill('Sabre3');
	await page.getByLabel('Reserve canopy *').fill('PD 160');
	await page.getByLabel('Last repack date *').fill('2026-01-01');
	await page.getByTestId('save-rig').click();
	await expect(page).toHaveURL(/\/app\/my-gear\/[0-9a-f-]+$/);
	const rigUrl = new URL(page.url()).pathname;

	// Hydrated: the date field appears for an AAD service only, and is required then
	await page.waitForLoadState('networkidle');
	const service = page.getByTestId('service-form');
	await expect(service.getByTestId('aad-next-due')).toBeHidden();
	await service.getByLabel('What was done').selectOption('aad_service');
	await expect(service.getByLabel('Next service due')).toBeVisible();
	await expect(service.getByLabel('Next service due')).toHaveAttribute('required', '');

	// Without JS: the field still shows (CSS), a missing date is refused and the choice survives
	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const plain = await noJs.newPage();
	await plain.goto(rigUrl);
	const form = plain.getByTestId('service-form');
	await expect(form.getByTestId('aad-next-due')).toBeHidden();
	await form.getByLabel('What was done').selectOption('aad_service');
	await expect(form.getByLabel('Next service due')).toBeVisible();
	await form.getByRole('button', { name: 'Record' }).click();
	await expect(form).toContainText('Enter when the next AAD service is due.');
	await expect(plain.getByText('No service recorded yet.')).toBeVisible();
	await expect(form.getByLabel('What was done')).toHaveValue('aad_service');
	await form.getByLabel('Next service due').fill('2030-06-01');
	await form.getByRole('button', { name: 'Record' }).click();
	await expect(plain.getByText('No service recorded yet.')).toHaveCount(0);
	await expect(plain.locator('input[name=aadServiceDueOn]')).toHaveValue('2030-06-01');
	await noJs.close();
});

test('deleting a jump, rig or team asks first — also before hydration / without JS', async ({ page, browser }) => {
	await signup(page, 'Careful Deleter');
	const visible = (id: string) => page.getByTestId(id).locator('visible=true');
	// Jump: the trigger only opens the question; Cancel keeps it; confirming deletes
	await page.goto('/app/logbook/new');
	await page.getByLabel('Jump #').fill('1');
	await page.getByLabel('Location').fill('Skydive Test Field');
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]+$/);
	const jumpUrl = page.url();
	await page.waitForLoadState('networkidle');
	await visible('delete-jump').locator('summary').click();
	await expect(visible('delete-jump')).toContainText('Delete jump #1? This can’t be undone.');
	await visible('delete-jump').getByRole('link', { name: 'Cancel' }).click();
	await expect(visible('delete-jump').getByRole('button', { name: 'Delete jump' })).toBeHidden();
	await expect(page).toHaveURL(jumpUrl);
	await visible('delete-jump').locator('summary').click();
	await visible('delete-jump').getByRole('button', { name: 'Delete jump' }).click();
	await expect(page).toHaveURL(/\/app\/logbook\?deleted=1$/);

	// Rig + team: created with JS, deleted without it
	await page.goto('/app/my-gear/new');
	await page.getByLabel('Container make & model *').fill('Javelin Odyssey');
	await page.getByLabel('Main canopy *').fill('Sabre3');
	await page.getByLabel('Reserve canopy *').fill('PD 160');
	await page.getByLabel('Last repack date *').fill('2026-01-01');
	await page.getByTestId('save-rig').click();
	await expect(page).toHaveURL(/\/app\/my-gear\/[0-9a-f-]+$/);
	const rigUrl = new URL(page.url()).pathname;
	await page.goto('/app/team');
	await page.getByTestId('new-team').click();
	await page.getByLabel('Team name').fill('Doomed 4-way');
	await page.getByRole('button', { name: 'Create team' }).click();
	await expect(page).toHaveURL(/\/app\/team\/[0-9a-f-]+$/);
	const teamUrl = new URL(page.url()).pathname;

	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const plain = await noJs.newPage();
	await plain.goto(rigUrl);
	const rig = plain.getByTestId('delete-rig');
	await expect(rig.getByRole('button', { name: 'Delete rig' })).toBeHidden();
	await rig.locator('summary').click();
	await expect(rig).toContainText('Delete this rig and its service history?');
	await rig.getByRole('link', { name: 'Cancel' }).click();
	await expect(plain).toHaveURL(new RegExp(`${rigUrl}$`));
	await expect(rig.getByRole('button', { name: 'Delete rig' })).toBeHidden();
	await rig.locator('summary').click();
	await rig.getByRole('button', { name: 'Delete rig' }).click();
	await expect(plain).toHaveURL(/\/app\/my-gear$/);
	await expect(plain.getByTestId('rig-card')).toHaveCount(0);

	await plain.goto(teamUrl);
	const team = plain.getByTestId('delete-team');
	await team.locator('summary').click();
	await expect(team).toContainText('Delete Doomed 4-way? This can’t be undone.');
	await team.getByRole('button', { name: 'Delete team' }).click();
	await expect(plain).toHaveURL(/\/app\/team$/);
	await expect(plain.getByText('Doomed 4-way')).toHaveCount(0);
	await noJs.close();
});

test('sign-off: a licensed jumper signs with a drawn signature; a second signer cannot replace it', async ({ page, browser }) => {
	await signup(page, 'Sam Student');
	// Nothing logged yet: the Freefall tile says so instead of a bare "0s"
	await page.goto('/app');
	const freefall = page.getByTestId('jumper-dashboard').getByRole('link', { name: /^Freefall/ });
	await expect(freefall).toContainText('—');
	await expect(freefall).toContainText('No jumps logged yet');
	await expect(freefall).not.toContainText('0s');
	await page.goto('/app/logbook/new');
	await page.getByLabel('Jump #').fill('120');
	await page.getByLabel('Location').fill('Skydive Test Field');
	await page.getByLabel('Aircraft').fill('Cessna 182');
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]+$/);
	const jumpUrl = page.url();
	// Jump #120 with one logged jump: the stats say they only cover the logged one
	await page.goto('/app/logbook');
	await expect(page.getByTestId('breakdown-scope')).toHaveText('Covers the 1 jump logged here, not all 120.');
	await expect(page.getByText('1 logged jump', { exact: true })).toBeVisible();
	// The dashboard's Freefall tile words it the same way (it said a bare "1 logged")
	await page.goto('/app');
	await expect(page.getByTestId('jumper-dashboard').getByText('1 logged jump', { exact: true })).toBeVisible();
	await page.goto(jumpUrl);
	await page.getByTestId('create-sign-link').click();
	const link = await page.getByLabel('Sign-off link').inputValue();

	// The instructor signs, drawing on the pad
	const ctxA = await browser.newContext({ baseURL: new URL(link).origin });
	const a = await ctxA.newPage();
	await signup(a, 'Ina Instructor');
	await addLicence(a, 'D-777');
	await a.goto(link);
	await a.waitForLoadState('networkidle');
	const pad = (await a.locator('canvas').boundingBox())!;
	await a.mouse.move(pad.x + 20, pad.y + pad.height / 2);
	await a.mouse.down();
	for (let i = 1; i <= 12; i++) await a.mouse.move(pad.x + 20 + i * 15, pad.y + pad.height / 2 + (i % 2 ? -15 : 15));
	await a.mouse.up();
	await a.getByLabel(/I witnessed or supervised/).check();
	await a.getByTestId('sign-now').click();
	await expect(a.getByTestId('sign-done')).toContainText('Jump has been signed');

	// Someone else with the same link can't overwrite it (page and a forced POST)
	const ctxB = await browser.newContext({ baseURL: new URL(link).origin });
	const b = await ctxB.newPage();
	await signup(b, 'Other Jumper');
	await addLicence(b, 'C-888');
	await b.goto(link);
	await expect(b.getByTestId('sign-done')).toContainText('Already signed by Ina Instructor');
	const forced = await b.request.post(link, { form: { confirm: '1' }, headers: { accept: 'application/json', origin: new URL(link).origin } });
	expect(await forced.text()).toContain('already been signed by Ina Instructor');

	// The unread badge sits on the bell's corner without hiding the bell
	await page.goto('/app');
	const bell = page.locator('[data-testid=notification-bell]:visible').first();
	await expect(bell.getByTestId('unread-count')).toBeVisible();
	const icon = (await bell.locator('svg').boundingBox())!;
	const badge = (await bell.getByTestId('unread-count').boundingBox())!;
	const overlapX = Math.max(0, Math.min(icon.x + icon.width, badge.x + badge.width) - Math.max(icon.x, badge.x));
	const overlapY = Math.max(0, Math.min(icon.y + icon.height, badge.y + badge.height) - Math.max(icon.y, badge.y));
	expect((overlapX * overlapY) / (icon.width * icon.height)).toBeLessThan(0.2);

	// The jumper is told which jump was signed; the note opens that jump
	await page.goto('/app/notifications');
	// Grouped by day: a note from a minute ago sits under "Today".
	await expect(page.getByTestId('notification-day').first().getByRole('heading', { level: 2 })).toHaveText('Today');
	await expect(page.getByRole('region', { name: 'Today' })).toContainText('Ina Instructor signed your jump #120.');
	await page.getByTestId('notification-list').getByRole('button', { name: /Ina Instructor signed your jump #120\./ }).click();
	await expect(page).toHaveURL(jumpUrl);
	// …and sees the signer and the drawn signature
	await expect(page.getByTestId('signed')).toContainText('Signed by Ina Instructor');
	await expect(page.getByTestId('signed')).toContainText('Licence D-777');
	const img = page.getByTestId('signature-img');
	await expect(img).toHaveAttribute('alt', 'Signature of Ina Instructor');
	await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
	// …which only the jumper and the signer may load
	const src = (await img.getAttribute('src'))!;
	expect((await a.request.get(src)).status()).toBe(200);
	expect((await b.request.get(src)).status()).toBe(404);
	await ctxA.close();
	await ctxB.close();
});

test('wallet top-up amounts: a minus sign is refused and "1,000" means a thousand', async ({ page }) => {
	await signup(page, 'Wally Wallet');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Wallet DZ ${test.info().project.name} ${Date.now()}`);
	await page.locator('select[name=country]').selectOption('ZA');
	await page.locator('select[name=currency]').selectOption('ZAR');
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/settings/features');
	await page.waitForLoadState('networkidle');
	await page.locator('label:has(input[name=walletEnabled])').click();
	await page.getByRole('button', { name: 'Save features' }).click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: /saved/i }).first()).toBeVisible();

	await page.goto('/app/wallet');
	await page.locator('main a[href^="/app/wallet/"]').first().click();
	await page.waitForLoadState('networkidle');
	const form = page.getByTestId('topup-form');
	// Same wording as the wallet list when nothing is held for jumps (not "R 0,00 reserved").
	await expect(page.getByTestId('wallet-reserved')).toHaveText('Nothing reserved');
	// "Try again" (#topup) on a phone lands the Add funds card below the sticky top bar
	if (test.info().project.name === 'mobile') {
		await page.goto(`${page.url().split('#')[0]}#topup`);
		await expect.poll(() => gapBelowTopBar(page, 'topup')).toBeGreaterThanOrEqual(8);
	}
	// Quick amounts are whole ("R 1 000", no cents) and the one matching the amount shows as picked.
	const presets = page.getByTestId('topup-preset');
	await expect(presets).toHaveCount(4);
	await expect(presets.nth(1)).toHaveText(/^R\s?1\s?000$/);
	await expect(page.locator('[data-testid=topup-preset][aria-pressed=true]')).toHaveCount(0);
	await presets.nth(1).click();
	await expect(page.locator('#amount')).toHaveValue('1000');
	await expect(presets.nth(1)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('[data-testid=topup-preset][aria-pressed=true]')).toHaveCount(1);
	await page.locator('#amount').fill('2 000');
	await expect(presets.nth(2)).toHaveAttribute('aria-pressed', 'true');
	await expect(presets.nth(1)).toHaveAttribute('aria-pressed', 'false');
	await page.locator('#amount').fill('-5');
	await page.getByTestId('topup-submit').click();
	await expect(form).toContainText('Enter a valid amount');
	await expect(page.getByTestId('pending-topups')).toHaveCount(0);

	await page.locator('#amount').fill('1,000');
	await page.getByTestId('topup-submit').click();
	await expect(page.getByTestId('pending-topups')).toContainText(/R\s?1\s?000,00/);
	await page.locator('#amount').fill('150,50');
	await page.getByTestId('topup-submit').click();
	await expect(page.getByTestId('pending-topups')).toContainText(/R\s?150,50/);

	// The Jumpers list flags the money waiting at the desk (both requests summed) + a filter chip.
	await page.goto('/app/jumpers?show=topup');
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await expect(page.getByTestId('topup-to-collect')).toHaveText(/R\s?1\s?150,50 to collect/);
	await expect(page.getByRole('navigation', { name: 'Filter jumpers' }).getByRole('link', { name: /Top-up to collect\s*1/ })).toHaveAttribute('aria-current', 'true');
	// On a phone the chip row scrolls sideways; the active chip is scrolled into view.
	await expect(page.getByRole('navigation', { name: 'Filter jumpers' }).getByRole('link', { name: /Top-up to collect/ })).toBeInViewport({ ratio: 1 });

	// Manifest sees the desk requests on the dashboard and settles them on the jumper's page.
	await page.goto('/app');
	const collect = page.getByTestId('topups-to-collect');
	await expect(collect.locator('li')).toHaveCount(2);
	await expect(collect).toContainText(/R\s?1\s?000,00/);
	await collect.locator('li a').first().click();
	await expect(page).toHaveURL(/\/app\/jumpers\/[^/]+$/);
	await page.waitForLoadState('networkidle');
	const requests = page.getByTestId('staff-topup-requests');
	await expect(requests.locator('li')).toHaveCount(2);
	const first = requests.locator('li').filter({ hasText: /R\s?1\s?000,00/ });
	await first.locator('select[name=provider]').selectOption('card');
	await first.getByRole('button', { name: 'Mark paid' }).click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: /1\s?000,00 added to the wallet/ }).first()).toBeVisible();
	await expect(requests.locator('li')).toHaveCount(1);
	await requests.getByRole('button', { name: 'Decline' }).click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: 'Top-up request declined' }).first()).toBeVisible();
	await expect(requests).toHaveCount(0);
	await page.goto('/app');
	await expect(page.getByTestId('topups-to-collect')).toHaveCount(0);
	await page.goto('/app/jumpers');
	await expect(page.getByTestId('topup-to-collect')).toHaveCount(0);
	await expect(page.getByRole('navigation', { name: 'Filter jumpers' }).getByRole('link', { name: /Top-up to collect/ })).toHaveCount(0);
	await page.goto('/app/wallet');
	await page.locator('main a[href^="/app/wallet/"]').first().click();
	await expect(page.getByTestId('pending-topups')).toHaveCount(0);
	await expect(page.locator('main')).toContainText(/Top-up[\s\S]*Card/);

	// The jumper is told about both outcomes; the note opens that dropzone's wallet.
	await page.goto('/app/notifications');
	const list = page.getByTestId('notification-list');
	await expect(list).toContainText('Top-up declined');
	await expect(list).toContainText(/declined your R\s?150,50 top-up request/);
	await list.getByRole('button', { name: /Wallet topped up/ }).click();
	await expect(page).toHaveURL(/\/app\/wallet\/[^/]+$/);
	await expect(page.getByTestId('topup-form')).toBeVisible();

	// Statement tabs follow ?tab= (History is the default with nothing owed): reload keeps the tab…
	await page.waitForLoadState('networkidle');
	await page.getByRole('tab', { name: /^Paid/ }).click();
	await expect(page).toHaveURL(/\/app\/wallet\/[^/?]+\?tab=paid$/);
	await page.reload();
	await expect(page.getByRole('tab', { name: /^Paid/ })).toHaveAttribute('aria-selected', 'true');
	await page.getByRole('tab', { name: 'History' }).click();
	await expect(page).toHaveURL(/\/app\/wallet\/[^/?]+$/);
	// …and the tabs are links that work without JS.
	const noJs = await page.context().browser()!.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const plain = await noJs.newPage();
	await plain.goto(new URL(page.url()).pathname);
	await plain.getByRole('tab', { name: /^Unpaid/ }).click();
	await expect(plain).toHaveURL(/\?tab=unpaid$/);
	await expect(plain.getByRole('tab', { name: /^Unpaid/ })).toHaveAttribute('aria-selected', 'true');
	await expect(plain.getByRole('tabpanel')).toContainText('All paid up');
	await plain.getByRole('tab', { name: 'History' }).click();
	await expect(plain).toHaveURL(/\/app\/wallet\/[^/?]+$/);
	await expect(plain.getByRole('tabpanel')).toContainText(/Top-up/);
	await noJs.close();
});

test('join form with an empty wallet: "not enough" + Top up link, but not at a DZ that allows a negative balance', async ({ page }) => {
	await signup(page, 'Penny Short');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Short DZ ${test.info().project.name} ${Date.now()}`);
	await page.locator('select[name=country]').selectOption('ZA');
	await page.locator('select[name=currency]').selectOption('ZAR');
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/pricelist');
	await page.waitForLoadState('networkidle');
	await page.locator('input[name=sport_slot]').first().fill('350');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: 'Price list updated' }).first()).toBeVisible();
	await page.goto('/app/settings/features');
	await page.waitForLoadState('networkidle');
	await page.locator('label:has(input[name=walletEnabled])').click();
	await page.getByRole('button', { name: 'Save features' }).click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: /saved/i }).first()).toBeVisible();
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-SHT');
	await dialog.getByLabel('Slots (pax)').fill('6');
	await dialog.getByLabel('Weight limit (kg)').fill('600');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	await expect(page.locator('[data-testid=load-card][data-load-number="1"]')).toBeVisible();

	await page.goto('/app/check-in');
	await page.getByLabel('Exit weight (kg)').fill('80');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toBeVisible();
	const load = page.locator('[data-testid=load-card][data-load="1"]');
	const join = (await load.getByTestId('join-solo').getAttribute('href'))!;
	await page.goto(`/app/check-in${join}`); // ?join= opens the form server-side
	const note = load.getByTestId('wallet-note');
	await expect(note).toContainText('not enough');
	await expect(note.getByRole('link', { name: 'Top up' })).toHaveAttribute('href', /^\/app\/wallet\/[a-z0-9-]+$/);

	await page.goto('/app/settings/features');
	await page.waitForLoadState('networkidle');
	await page.locator('label:has(input[name=walletAllowNegative])').click();
	await page.getByRole('button', { name: 'Save features' }).click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: /saved/i }).first()).toBeVisible();
	await page.goto(`/app/check-in${join}`);
	await expect(note).toContainText('your balance will go below zero');
	await expect(note).not.toContainText('not enough');
	await expect(note.getByRole('link', { name: 'Top up' })).toHaveCount(0);
	await page.waitForLoadState('networkidle');
	await load.getByRole('button', { name: 'Join this load' }).click();
	await expect(load.getByText('You’re on this load')).toBeVisible();
});

test('paying from the wallet, checking out, leaving a team and removing a teammate or buddy ask first — also before hydration / without JS', async ({ page, browser }) => {
	test.setTimeout(60_000); // ~22 s alone; overran 30 s under full-suite load
	await signup(page, 'Prudent Payer');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Prudent DZ ${test.info().project.name} ${Date.now()}`);
	await page.locator('select[name=country]').selectOption('ZA');
	await page.locator('select[name=currency]').selectOption('ZAR');
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/pricelist');
	await page.waitForLoadState('networkidle');
	await page.locator('input[name=sport_slot]').first().fill('350');
	await page.getByRole('button', { name: 'Save all' }).first().click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: 'Price list updated' }).first()).toBeVisible();
	await page.goto('/app/settings/features');
	await page.waitForLoadState('networkidle');
	await page.locator('label:has(input[name=walletEnabled])').click();
	await page.locator('label:has(input[name=walletAllowNegative])').click();
	await page.getByRole('button', { name: 'Save features' }).click();
	await expect(page.locator('[role=status], [aria-live]').filter({ hasText: /saved/i }).first()).toBeVisible();
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-PRU');
	await dialog.getByLabel('Slots (pax)').fill('6');
	await dialog.getByLabel('Weight limit (kg)').fill('600');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	await expect(page.locator('[data-testid=load-card][data-load-number="1"]')).toBeVisible();
	await page.goto('/app/check-in');
	await page.getByLabel('Exit weight (kg)').fill('80');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toBeVisible();
	const load = page.locator('[data-testid=load-card][data-load="1"]');
	await page.goto(`/app/check-in${(await load.getByTestId('join-solo').getAttribute('href'))!}`);
	await page.waitForLoadState('networkidle');
	await load.getByRole('button', { name: 'Join this load' }).click();
	await expect(load.getByText('You’re on this load')).toBeVisible();

	// Wallet (JS): "Pay with wallet" only asks; Cancel keeps the jump unpaid
	await page.goto('/app/wallet');
	await page.locator('main a[href^="/app/wallet/"]').first().click();
	await expect(page).toHaveURL(/\/app\/wallet\/[^/]+$/);
	const walletUrl = new URL(page.url()).pathname;
	await page.waitForLoadState('networkidle');
	const pay = page.getByTestId('pay-wallet');
	await expect(pay.getByTestId('pay-wallet-confirm')).toBeHidden();
	await pay.locator('summary').click();
	await expect(pay).toContainText(/Pay R\s?350,00 for 1 jump from your wallet\?/);
	await pay.getByRole('link', { name: 'Cancel' }).click();
	await expect(pay.getByTestId('pay-wallet-confirm')).toBeHidden();
	await expect(page).toHaveURL(new RegExp(`${walletUrl}$`));

	// Without JS: one tap opens the question, the confirm button pays
	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const plain = await noJs.newPage();
	await plain.goto(walletUrl);
	const plainPay = plain.getByTestId('pay-wallet');
	await plainPay.locator('summary').click();
	await expect(plainPay.getByTestId('pay-wallet-confirm')).toHaveText(/Pay R\s?350,00/);
	await plainPay.getByTestId('pay-wallet-confirm').click();
	await expect(plain.getByRole('tab', { name: 'Paid 1' })).toBeVisible();
	await expect(plain.getByRole('tab', { name: 'Unpaid 0' })).toBeVisible();

	// Check out: no-JS Cancel keeps the check-in; JS confirm checks out
	await plain.goto('/app/check-in');
	const plainOut = plain.getByTestId('checkout');
	await plainOut.locator('summary').click();
	await expect(plainOut).toContainText('Check out of Prudent DZ');
	await plainOut.getByRole('link', { name: 'Cancel' }).click();
	await expect(plain.getByTestId('checked-in')).toBeVisible();
	await page.goto('/app/check-in');
	await page.waitForLoadState('networkidle');
	const out = page.getByTestId('checkout');
	await out.locator('summary').click();
	await out.getByRole('button', { name: 'Check out' }).click();
	await expect(page.getByTestId('checked-in')).toHaveCount(0);

	// Leave team: a teammate (not the owner) confirms without JS
	await page.goto('/app/team');
	await page.getByTestId('new-team').click();
	await page.getByLabel('Team name').fill('Prudent 2-way');
	await page.getByRole('button', { name: 'Create team' }).click();
	await expect(page).toHaveURL(/\/app\/team\/[0-9a-f-]+$/);
	const teamUrl = new URL(page.url()).pathname;
	const mate = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin });
	const matePage = await mate.newPage();
	const mateName = `Mate ${Date.now().toString(36)}`;
	await signup(matePage, mateName);
	await page.goto(`${teamUrl}?q=${encodeURIComponent(mateName)}`);
	await page.getByTestId('member-results').getByRole('button', { name: 'Add to team' }).click();
	await expect(page.getByTestId('team-members')).toContainText(mateName);
	await matePage.goto(teamUrl);
	const leave = matePage.getByTestId('leave-team');
	await expect(leave.getByRole('button', { name: 'Leave team' })).toBeHidden();
	await leave.locator('summary').click();
	await expect(leave).toContainText('Leave Prudent 2-way? Only the team owner can add you back.');
	await leave.getByRole('button', { name: 'Leave team' }).click();
	await expect(matePage).toHaveURL(/\/app\/team$/);
	await expect(matePage.getByText('Prudent 2-way')).toHaveCount(0);

	// Remove a member (JS): the x only asks; Cancel keeps them; Remove removes
	await page.goto(`${teamUrl}?q=${encodeURIComponent(mateName)}`);
	await page.waitForLoadState('networkidle');
	await page.getByTestId('member-results').getByRole('button', { name: 'Add to team' }).click();
	const removeMate = page.getByTestId('remove-member');
	await expect(removeMate).toHaveCount(1);
	await removeMate.locator('summary').click();
	await expect(removeMate).toContainText(`Remove ${mateName} from the team?`);
	await removeMate.getByRole('link', { name: 'Cancel' }).click();
	await expect(removeMate.getByRole('button', { name: 'Remove' })).toBeHidden();
	await expect(page.getByTestId('team-members')).toContainText(mateName);
	await removeMate.locator('summary').click();
	await removeMate.getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByTestId('team-members')).not.toContainText(mateName);

	// Remove a jump buddy without JS: one tap only asks, the confirm removes
	await page.goto(`/app/team?q=${encodeURIComponent(mateName)}`);
	await page.waitForLoadState('networkidle');
	await page.getByTestId('buddy-results').getByRole('button', { name: 'Add' }).click();
	await expect(page.getByTestId('remove-buddy')).toHaveCount(1);
	await plain.goto('/app/team');
	const buddy = plain.getByTestId('remove-buddy');
	await expect(buddy.getByRole('button', { name: 'Remove' })).toBeHidden();
	await buddy.locator('summary').click();
	await expect(buddy).toContainText(`Remove ${mateName} from your jump buddies?`);
	await buddy.getByRole('button', { name: 'Remove' }).click();
	await expect(plain.getByTestId('remove-buddy')).toHaveCount(0);
	await expect(plain.getByText('No buddies yet.')).toBeVisible();
	await mate.close();
	await noJs.close();
});

test('check-in Edit works before hydration / without JS, and no-JS posts show their success line', async ({ page, browser }) => {
	await signup(page, 'Edgy Editor');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Editor DZ ${test.info().project.name} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);

	// Without JS: checking in shows the success line the toast would have shown
	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const plain = await noJs.newPage();
	await plain.goto('/app/check-in');
	await plain.getByLabel('Exit weight (kg)').fill('80');
	await plain.getByTestId('checkin-submit').click();
	await expect(plain.getByTestId('checked-in')).toBeVisible();
	await expect(plain.getByTestId('no-js-success')).toHaveText(/You’re checked in/);

	// Edit is a ?edit=1 link that renders the form server-side; errors show inside the form
	const card = plain.getByTestId('checked-in');
	await expect(card.getByTestId('checkin-edit')).toHaveAttribute('href', '?edit=1');
	await card.getByTestId('checkin-edit').click();
	await expect(plain).toHaveURL(/\?edit=1$/);
	await card.getByLabel('Exit weight (kg)').fill('20');
	await card.getByRole('button', { name: 'Save' }).click();
	await expect(card.getByRole('alert')).toHaveText(/30–200/);
	await expect(plain.getByTestId('no-js-success')).toHaveCount(0);
	await card.getByLabel('Exit weight (kg)').fill('82.5');
	await card.getByRole('button', { name: 'Save' }).click();
	await expect(plain.getByTestId('no-js-success')).toHaveText(/Check-in updated/);
	await expect(card).toContainText('82.5 kg');
	await expect(card.getByRole('button', { name: 'Save' })).toHaveCount(0);
	// Cancel is a link back to the plain page
	await card.getByTestId('checkin-edit').click();
	await card.getByTestId('checkin-edit-cancel').click();
	await expect(plain).toHaveURL(/\/app\/check-in$/);
	await expect(card.getByRole('button', { name: 'Save' })).toHaveCount(0);
	await noJs.close();

	// With JS: Edit/Cancel toggle in place, Save toasts (no inline success line)
	await page.goto('/app/check-in');
	await page.waitForLoadState('networkidle');
	const live = page.getByTestId('checked-in');
	const url = page.url();
	await live.getByTestId('checkin-edit').click();
	await expect(live.getByRole('button', { name: 'Save' })).toBeVisible();
	expect(page.url()).toBe(url);
	await live.getByTestId('checkin-edit-cancel').click();
	await expect(live.getByRole('button', { name: 'Save' })).toHaveCount(0);
	expect(page.url()).toBe(url);
	await live.getByTestId('checkin-edit').click();
	await live.getByLabel('Exit weight (kg)').fill('84');
	await live.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Check-in updated')).toBeVisible();
	await expect(live).toContainText('84 kg');
	await expect(page.getByTestId('no-js-success')).toHaveCount(0);
});

test('changing or leaving a load works before hydration / without JS, and leaving asks first', async ({ page, browser }) => {
	await signup(page, 'Lofty Leaver');
	await page.goto('/app/dropzones/new');
	await page.getByLabel('Dropzone name').fill(`Leaver DZ ${test.info().project.name} ${Date.now()}`);
	await page.getByRole('button', { name: 'Create dropzone' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await page.goto('/app/manifest');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-load').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Airplane name / number').fill('ZS-LVE');
	await dialog.getByLabel('Slots (pax)').fill('6');
	await dialog.getByLabel('Weight limit (kg)').fill('600');
	await dialog.getByRole('button', { name: 'Create load' }).click();
	await expect(page.locator('[data-testid=load-card][data-load-number="1"]')).toBeVisible();
	await page.goto('/app/check-in');
	await page.getByLabel('Exit weight (kg)').fill('80');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toBeVisible();
	const load = page.locator('[data-testid=load-card][data-load="1"]');
	await page.goto(`/app/check-in${(await load.getByTestId('join-solo').getAttribute('href'))!}`);
	await page.waitForLoadState('networkidle');
	await load.getByRole('button', { name: 'Join this load' }).click();
	await expect(load.getByText('You’re on this load')).toBeVisible();

	// Without JS: Change is a ?change= link that opens the panel server-side
	const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin, storageState: await page.context().storageState() });
	const plain = await noJs.newPage();
	await plain.goto('/app/check-in');
	const plainLoad = plain.locator('[data-testid=load-card][data-load="1"]');
	await expect(plainLoad.getByTestId('change-slot')).toHaveAttribute('href', /^\?change=[0-9a-f-]+$/);
	await plainLoad.getByTestId('change-slot').click();
	await expect(plain).toHaveURL(/\?change=/);
	await plainLoad.locator('label', { hasText: 'Freeflying' }).click();
	await plainLoad.getByRole('button', { name: 'Save changes' }).click();
	await expect(plainLoad.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
	await expect(plainLoad).toContainText('Freeflying');

	// Without JS: Leave only asks; Cancel keeps the slot, the confirm button leaves
	const plainLeave = plainLoad.getByTestId('leave-load');
	await expect(plainLeave.getByRole('button', { name: 'Leave load' })).toBeHidden();
	await plainLeave.locator('summary').click();
	await expect(plainLeave).toContainText('Leave load 1? Your slot goes back to the load');
	await plainLeave.getByRole('link', { name: 'Cancel' }).click();
	await expect(plainLoad.getByText('You’re on this load')).toBeVisible();
	await plainLoad.getByTestId('leave-load').locator('summary').click();
	await plainLoad.getByTestId('leave-load').getByRole('button', { name: 'Leave load' }).click();
	await expect(plainLoad.getByTestId('join-solo')).toBeVisible();
	await expect(plainLoad.getByText('You’re on this load')).toHaveCount(0);
	await noJs.close();

	// With JS: Change toggles in place; Leave → Cancel keeps it, confirm leaves
	await page.goto('/app/check-in');
	await page.goto(`/app/check-in${(await load.getByTestId('join-solo').getAttribute('href'))!}`);
	await page.waitForLoadState('networkidle');
	// Tap Change the moment it appears (same JS turn as the re-render, before the join form's
	// `ondone` runs): the late close of the join panel must not shut the Change panel.
	await page.evaluate(() => {
		const card = document.querySelector('[data-testid=load-card][data-load="1"]')!;
		new MutationObserver((_, obs) => {
			const change = card.querySelector<HTMLElement>('[data-testid=change-slot]');
			if (change) {
				obs.disconnect();
				change.click();
			}
		}).observe(card, { childList: true, subtree: true });
	});
	await load.getByRole('button', { name: 'Join this load' }).click();
	await expect(load.getByText('You’re on this load')).toBeVisible();
	const url = page.url();
	await expect(load.getByRole('button', { name: 'Save changes' })).toBeVisible();
	await page.waitForTimeout(300);
	await expect(load.getByRole('button', { name: 'Save changes' })).toBeVisible();
	expect(page.url()).toBe(url);
	await load.getByTestId('change-slot').click();
	await expect(load.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
	await load.getByTestId('change-slot').click();
	await expect(load.getByRole('button', { name: 'Save changes' })).toBeVisible();
	expect(page.url()).toBe(url);
	await load.getByTestId('change-slot').click();
	await expect(load.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
	const leave = load.getByTestId('leave-load');
	await leave.locator('summary').click();
	await leave.getByRole('link', { name: 'Cancel' }).click();
	await expect(leave.getByRole('button', { name: 'Leave load' })).toBeHidden();
	await leave.locator('summary').click();
	await leave.getByRole('button', { name: 'Leave load' }).click();
	await expect(load.getByTestId('join-solo')).toBeVisible();
});

test('two dropzones: checking in makes that one active; with no dz cookie the check-in decides', async ({ page, context }) => {
	const project = test.info().project.name;
	await signup(page, 'Tess Twodz');
	const names = [`Home DZ ${project} ${Date.now()}`, `Away DZ ${project} ${Date.now()}`];
	for (const name of names) {
		await page.goto('/app/dropzones/new');
		await page.getByLabel('Dropzone name').fill(name);
		await page.getByRole('button', { name: 'Create dropzone' }).click();
		await expect(page).toHaveURL(/\/app$/);
	}
	// creating "Away" made it active; check in at "Home"
	await page.goto('/app/dropzones');
	await page.getByTestId('dz-search').fill(names[0]);
	await page.getByTestId('dz-search').press('Enter');
	await page.getByRole('link', { name: names[0] }).click();
	await page.getByTestId('dz-checkin').click();
	await expect(page).toHaveURL(/\/app\/check-in/);
	await page.getByLabel('Exit weight (kg)').fill('80');
	await page.getByTestId('checkin-submit').click();
	await expect(page.getByTestId('checked-in')).toContainText(names[0]);
	const dropzoneSelect = page.locator('select[name=dropzoneId] option:checked');
	await page.goto('/app/logbook/new');
	await expect(dropzoneSelect).toHaveText(names[0]);

	// a new device / cleared cookie: the open check-in picks the dropzone, not the name order
	await context.clearCookies({ name: 'dz' });
	await page.goto('/app/logbook/new');
	await expect(dropzoneSelect).toHaveText(names[0]);
});

test('log a jump starts from the last jump at the chosen dropzone; switching dropzone swaps untouched plane + altitude', async ({ page }) => {
	const project = test.info().project.name;
	await signup(page, 'Rita Repeat');
	const names = [`Repeat Home ${project} ${Date.now()}`, `Repeat Away ${project} ${Date.now()}`];
	for (const name of names) {
		await page.goto('/app/dropzones/new');
		await page.getByLabel('Dropzone name').fill(name);
		await page.getByRole('button', { name: 'Create dropzone' }).click();
		await expect(page).toHaveURL(/\/app$/);
	}
	const dz = page.getByLabel('Dropzone', { exact: true });
	const plane = page.getByLabel('Aircraft');
	const alt = page.getByLabel('Altitude (ft)');
	// first jump ever: nothing to copy
	await page.goto('/app/logbook/new');
	await page.waitForLoadState('networkidle');
	await expect(plane).toHaveValue('');
	await expect(alt).toHaveValue('');
	await dz.selectOption({ label: names[0] });
	await plane.fill('Caravan');
	await alt.fill('13000');
	await page.locator('label:has(input[name=jumpType][value=belly])').click();
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]{36}(\?added=1)?$/);

	// the active dropzone ("Away") has no jumps yet: plane + altitude blank, jump type carried over
	await page.goto('/app/logbook/new');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('select[name=dropzoneId] option:checked')).toHaveText(names[1]);
	await expect(plane).toHaveValue('');
	await expect(alt).toHaveValue('');
	await expect(page.locator('input[name=jumpType][value=belly]')).toBeChecked();
	await dz.selectOption({ label: names[0] });
	await expect(plane).toHaveValue('Caravan');
	await expect(alt).toHaveValue('13000');
	// a plane the jumper typed stays when switching back; the untouched altitude follows the dropzone
	await plane.fill('Otter');
	await dz.selectOption({ label: names[1] });
	await expect(plane).toHaveValue('Otter');
	await expect(alt).toHaveValue('');
	await dz.selectOption({ label: names[0] });
	await expect(plane).toHaveValue('Otter');
	await expect(alt).toHaveValue('13000');
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]{36}(\?added=1)?$/);
	await page.goto('/app/logbook/new');
	await page.waitForLoadState('networkidle');
	await dz.selectOption({ label: names[0] });
	await expect(plane).toHaveValue('Otter');

	// a jump logged under a number already in the logbook: both cards say so in the list
	await page.goto('/app/logbook');
	await expect(page.getByTestId('jump-card')).toHaveCount(2);
	expect(await page.getByTestId('jump-card').filter({ hasText: 'Number repeated' }).count()).toBe(0);
	await page.goto('/app/logbook/new');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Jump #').fill('2');
	await page.getByTestId('save-jump').click();
	await expect(page).toHaveURL(/\/app\/logbook\/[0-9a-f-]{36}(\?added=1)?$/);
	await page.goto('/app/logbook');
	await expect(page.getByTestId('jump-card').filter({ hasText: 'Number repeated' })).toHaveCount(2);
	await expect(page.getByTestId('jump-card').filter({ hasNotText: 'Number repeated' })).toHaveText(/^\s*Jump\s*1(?!\d)/);
});
