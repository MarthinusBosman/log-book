import { brand } from '#lib/brand.ts';
import { THEME_COLORS } from '#lib/theme.ts';

/**
 * Web app manifest generated from brand.ts so a rename needs no edits here.
 * (Not prerendered: hooks open the DB, which prerendering can't do on the Cloudflare target.)
 */
export const GET = () =>
	new Response(
		JSON.stringify(
			{
				name: brand.name,
				short_name: brand.name,
				description: brand.description,
				start_url: '/app',
				scope: '/',
				display: 'standalone',
				background_color: THEME_COLORS.dark,
				theme_color: THEME_COLORS.dark,
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			null,
			'\t'
		),
		{ headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } }
	);
