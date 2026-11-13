import { expect, test, type Page } from '@playwright/test';

// The GitHub API is scripts/mock-github.ts (playwright.config.ts webServer); nothing reaches github.com.
const MOCK = 'http://localhost:4319';
const ZWJ = '\u200D';

async function signUp(page: Page, name: string) {
	await page.goto('/signup');
	await page.getByLabel('Full name').fill(name);
	await page.getByLabel('Email').fill(`feedback-${Date.now()}-${test.info().project.name}@example.com`);
	await page.getByLabel('Password').fill('blue-skies-123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app$/);
}

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('feedback: public notice, failure keeps the text, posts a scrubbed issue, rate limited', async ({ page, request }) => {
		await signUp(page, 'Fiona Feedback');
		await page.goto('/app/logbook');
		if (test.info().project.name === 'desktop') {
			await page.locator('aside').getByTestId('feedback-link').click();
		} else {
			// The mobile "More" menu needs JavaScript; the page itself works without it.
			await page.goto('/app/feedback?from=%2Fapp%2Flogbook%3Ftab%3Dx');
		}
		await expect(page).toHaveURL(/\/app\/feedback\?from=%2Fapp%2Flogbook/);
		await expect(page.getByTestId('feedback-notice')).toContainText('Feedback is posted publicly on GitHub');
		await expect(page.getByTestId('feedback-notice')).toContainText('Email addresses and phone numbers are removed automatically');

		const form = page.getByTestId('feedback-form');
		await expect(form.getByRole('checkbox')).toBeChecked();
		await expect(form).toContainText('(/app/logbook)');

		// GitHub down (mock answers 503): friendly error, text kept.
		const down = 'Please add totals to the logbook page. mock:github-down';
		await form.getByLabel('Idea').check();
		await form.getByLabel('Message').fill(down);
		await form.getByRole('button', { name: 'Post feedback' }).click();
		await expect(page.getByTestId('feedback-form').getByRole('alert')).toContainText("couldn't reach GitHub");
		await expect(page.getByTestId('feedback-form').getByLabel('Message')).toHaveValue(down);
		await expect(page.getByTestId('feedback-form').getByLabel('Idea')).toBeChecked();

		const marker = `m${Date.now()}${test.info().project.name}`;
		const message = `Totals per year on the logbook would be great @octocat see #5. Mail me at fiona@example.com ${marker}`;
		await page.getByTestId('feedback-form').getByLabel('Message').fill(message);
		await page.getByTestId('feedback-form').getByRole('button', { name: 'Post feedback' }).click();
		await expect(page).toHaveURL(/\/app\/feedback\?sent=\d+&scrubbed=1$/);
		const box = page.getByTestId('feedback');
		await expect(box.getByRole('status')).toContainText(/Thanks — posted as issue #\d+\./);
		await expect(page.getByTestId('feedback-scrubbed')).toBeVisible();
		const n = Number(new URL(page.url()).searchParams.get('sent'));
		await expect(page.getByTestId('feedback-issue-link')).toHaveAttribute('href', `${MOCK}/e2e/log-book/issues/${n}`);

		// What GitHub received.
		const issues = (await (await request.get(`${MOCK}/__issues`)).json()) as {
			number: number;
			repo: string;
			title: string;
			body: string;
			labels: string[];
			authorization: string;
		}[];
		const issue = issues.find((i) => i.body.includes(marker))!;
		expect(issue.number).toBe(n);
		expect(issue.repo).toBe('e2e/log-book');
		expect(issue.authorization).toBe('Bearer e2e-dummy-token');
		expect(issue.labels).toEqual(['feedback', 'idea']);
		expect(issue.title.startsWith('[Feedback] Idea: Totals per year on the logbook would be great')).toBe(true);
		expect(issue.body).toContain(`@${ZWJ}octocat`);
		expect(issue.body).toContain(`#${ZWJ}5`);
		expect(issue.body).toContain('[email removed]');
		expect(issue.body).not.toContain('fiona@example.com');
		expect(issue.body).not.toContain('Fiona');
		expect(issue.body).toContain('- Page: `/app/logbook`');
		expect(issue.body).not.toContain('tab=x');
		expect(issue.body).toMatch(/- Reporter: `[0-9a-f]{12}`/);
		expect(issues.some((i) => i.body.includes('mock:github-down'))).toBe(false);

		// Second post right away: 30 s cooldown.
		await page.goto('/app/feedback?from=%2Fapp');
		await page.getByTestId('feedback-form').getByLabel('Bug').check();
		await page.getByTestId('feedback-form').getByLabel('Message').fill('Another one straight away, should be refused.');
		await page.getByTestId('feedback-form').getByRole('button', { name: 'Post feedback' }).click();
		await expect(page.getByTestId('feedback-form').getByRole('alert')).toContainText('wait half a minute');
	});
});

test('feedback entry in the app shell (desktop sidebar, mobile More menu)', async ({ page }) => {
	await signUp(page, 'Mo Menu');
	await page.goto('/app/wallet');
	await page.waitForLoadState('networkidle');
	if (test.info().project.name === 'mobile') {
		await page.getByRole('navigation', { name: 'Quick' }).getByRole('button', { name: 'More' }).click();
		await page.locator('dialog[open]').getByTestId('feedback-link').click();
	} else {
		await page.locator('aside').getByTestId('feedback-link').click();
	}
	await expect(page).toHaveURL(/\/app\/feedback\?from=%2Fapp%2Fwallet$/);
	await expect(page.getByRole('heading', { name: 'Feedback', level: 1 })).toBeVisible();
});
