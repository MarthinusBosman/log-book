import { defineConfig, devices } from '@playwright/test';

const PORT = 4318;

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
	// Production build of the self-hosted (Bun) target against a throwaway SQLite file.
	webServer: {
		command: `rm -f data/e2e.db* && bun run build:bun && PORT=${PORT} ORIGIN=http://localhost:${PORT} DATABASE_PATH=data/e2e.db bun build/server.js`,
		url: `http://localhost:${PORT}/api/health`,
		timeout: 180_000,
		reuseExistingServer: false
	}
});
