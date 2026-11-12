/**
 * Single source of truth for the product brand. Change it here and it propagates everywhere
 * (titles, landing, meta/OG tags, web manifest, emails, app shell). After a rename, run
 * `bun run og` to regenerate the social image and app icons in `static/`.
 */
export const brand = {
	name: 'Log-Book',
	tagline: 'Run the dropzone. Log every jump.',
	description:
		'Manifest, tandem bookings, waivers, staff pay and gear for dropzones. A free logbook, wallet and self-manifest for every jumper. Hosted, or on your own server.',
	/** Public domain of the hosted instance. log-book.io 301s here (CANONICAL_HOST, see docs/DEPLOY.md). */
	domain: 'log-book.app',
	supportEmail: 'hello@log-book.app',
	/** Where the product is built (site footer). */
	madeIn: 'South Africa',
	/** Primary brand colour (also defined as a CSS token in app.css). */
	color: '#1E6BFF',
	/** SPDX licence of the code (LICENSE). */
	license: 'AGPL-3.0-or-later',
	/**
	 * Where users can get the source of the running app (AGPL-3.0 §13): linked as "Source code" in
	 * the site and login footers. If you run a MODIFIED version for other people, point this at your
	 * modified source.
	 */
	sourceUrl: 'https://github.com/MarthinusBosman/log-book',
	/** Self-host installer (served by this app at /install.sh, see src/routes/install.sh/+server.ts). */
	installUrl: 'https://log-book.app/install.sh'
} as const;

export type Brand = typeof brand;
