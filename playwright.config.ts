import { defineConfig, devices } from '@playwright/test';

const PORT = 4318;
/** scripts/mock-github.ts: in-app Feedback posts here instead of api.github.com. */
const GITHUB_MOCK_PORT = 4319;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: [
		{
			command: `PORT=${GITHUB_MOCK_PORT} bun scripts/mock-github.ts`,
			url: `http://localhost:${GITHUB_MOCK_PORT}/__issues`,
			timeout: 30_000,
			reuseExistingServer: false
		},
		// Production build of the self-hosted (Bun) target against a throwaway SQLite file.
		// RESEND_API_KEY is blanked so a key in the developer's shell can never send real email
		// (emails go to the console instead). GITHUB_FEEDBACK_TOKEN is replaced by a dummy and
		// FEEDBACK_API_BASE points at the local mock, so feedback never reaches github.com.
		{
			command: `rm -f data/e2e.db* && bun run build:bun && RESEND_API_KEY= GITHUB_FEEDBACK_TOKEN=e2e-dummy-token FEEDBACK_REPO=e2e/log-book FEEDBACK_API_BASE=http://localhost:${GITHUB_MOCK_PORT} PORT=${PORT} ORIGIN=http://localhost:${PORT} DATABASE_PATH=data/e2e.db bun build/server.js`,
			url: `http://localhost:${PORT}/api/health`,
			timeout: 180_000,
			reuseExistingServer: false
		}
	]
});
