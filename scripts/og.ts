/**
 * Renders the social card and app icons from brand.ts into static/:
 *   og.png (1200×630), apple-touch-icon.png (180), icon-192.png, icon-512.png, icon-maskable-512.png
 *
 *   bun run og
 *
 * Uses Playwright's Chromium (already a dev dependency for e2e). Re-run after changing the brand name,
 * tagline or domain; the PNGs are committed so builds and Docker images don't need a browser.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brand } from '../src/lib/brand.ts';

const root = resolve(import.meta.dir, '..');
const out = (f: string) => resolve(root, 'static', f);
const font = readFileSync(resolve(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')).toString('base64');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const mark = (size: number) => `
<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none">
	<path d="M5 15a11 11 0 0 1 22 0" stroke="#fff" stroke-width="2.6" stroke-linecap="round" />
	<path d="M5 15l11 10 11-10M16 15v10" stroke="#fff" stroke-opacity="0.75" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

const base = `
<style>
	@font-face { font-family: Inter; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 900; }
	* { margin: 0; box-sizing: border-box; }
	body { font-family: Inter, sans-serif; font-feature-settings: 'cv11', 'ss01', 'ss03'; -webkit-font-smoothing: antialiased; }
	.tile { display: grid; place-items: center; background: linear-gradient(135deg, #598cff, #0b55ec); }
</style>`;

const [line1, ...rest] = brand.tagline.split('. ');
const line2 = rest.join('. ');

const ticks = Array.from({ length: 15 }, (_, i) => 14 - i)
	.map((k) => {
		const y = 70 + ((14 - k) / 14) * 470;
		const major = k % 2 === 0;
		return `<div style="position:absolute;left:0;top:${y}px;display:flex;align-items:center;transform:translateY(-50%)">
			<span style="width:34px;text-align:right;font:500 13px ui-monospace,monospace;color:${major ? '#5f6f8f' : 'transparent'}">${k}k</span>
			<span style="margin-left:10px;height:1px;width:${major ? 14 : 7}px;background:#2a3a5e"></span></div>`;
	})
	.join('');
const mk = (k: number, label: string, color: string) =>
	`<div style="position:absolute;left:58px;top:${70 + ((14 - k) / 14) * 470}px;transform:translateY(-50%);display:flex;align-items:center;gap:10px">
		<span style="height:1px;width:18px;background:${color};opacity:.7"></span>
		<span style="font:500 13px ui-monospace,monospace;letter-spacing:.16em;white-space:nowrap;color:${color}">${label}</span></div>`;

const og = `<!doctype html>${base}
<body style="width:1200px;height:630px;overflow:hidden;background:#060b17;color:#e8eefb;position:relative">
	<div style="position:absolute;inset:0;background-image:linear-gradient(to right,rgb(148 163 184/.07) 1px,transparent 1px),linear-gradient(to bottom,rgb(148 163 184/.07) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse at 30% 30%,#000 20%,transparent 75%)"></div>
	<div style="position:absolute;left:-200px;top:-360px;width:1200px;height:900px;background:radial-gradient(closest-side,rgb(30 107 255/.38),transparent)"></div>
	<svg style="position:absolute;inset:0" width="1200" height="630"><path d="M-10 520 L1210 90" stroke="#1e6bff" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="2 9"/></svg>

	<div style="position:absolute;left:80px;top:72px;display:flex;align-items:center;gap:16px">
		<div class="tile" style="width:56px;height:56px;border-radius:16px;box-shadow:0 0 0 1px rgb(30 107 255/.3),0 10px 40px -8px rgb(30 107 255/.6)">${mark(34)}</div>
		<span style="font-size:34px;font-weight:620;letter-spacing:-.02em">${esc(brand.name)}</span>
	</div>

	<div style="position:absolute;left:80px;top:208px;width:880px">
		<div style="font-size:84px;line-height:1.02;font-weight:590;letter-spacing:-.04em">${esc(line1)}${line2 ? '.' : ''}</div>
		${line2 ? `<div style="font-size:84px;line-height:1.08;font-weight:590;letter-spacing:-.04em;color:#93a1bd">${esc(line2)}</div>` : ''}
		<div style="margin-top:34px;font-size:26px;line-height:1.4;color:#93a1bd;max-width:860px;text-wrap:balance">Manifest, tandems and staff for dropzones. A free logbook for every jumper.</div>
	</div>

	<div style="position:absolute;left:80px;bottom:54px;font:500 20px ui-monospace,monospace;color:#5f6f8f;letter-spacing:.04em">${esc(brand.domain)}</div>

	<div style="position:absolute;right:40px;top:0;width:170px;height:630px">
		<div style="position:absolute;left:44px;top:70px;height:470px;width:1px;background:linear-gradient(#2a3a5e,#2a3a5e 85%,transparent)"></div>
		${ticks}
		${mk(13.5, 'EXIT', '#598cff')}${mk(5.5, 'BREAK-OFF', '#fbbf24')}${mk(3, 'PULL', '#34d399')}
		<div style="position:absolute;left:44px;top:${70 + (0.5 / 14) * 470}px;width:14px;height:14px;border-radius:99px;background:#1e6bff;transform:translate(-50%,-50%);box-shadow:0 0 0 6px rgb(30 107 255/.25)"></div>
	</div>
</body>`;

const icon = (size: number, pad: number, radius: number) => `<!doctype html>${base}
<body style="width:${size}px;height:${size}px;overflow:hidden;background:transparent">
	<div class="tile" style="width:${size}px;height:${size}px;border-radius:${radius}px">${mark(Math.round(size * (1 - pad * 2)))}</div>
</body>`;

const browser = await chromium.launch();
const page = await browser.newPage();
const shot = async (html: string, w: number, h: number, file: string, transparent = false) => {
	await page.setViewportSize({ width: w, height: h });
	await page.setContent(html, { waitUntil: 'load' });
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: out(file), omitBackground: transparent });
	console.log('wrote static/' + file);
};

await shot(og, 1200, 630, 'og.png');
await shot(icon(180, 0.2, 0), 180, 180, 'apple-touch-icon.png'); // iOS rounds the corners itself
await shot(icon(192, 0.2, 42), 192, 192, 'icon-192.png', true);
await shot(icon(512, 0.2, 112), 512, 512, 'icon-512.png', true);
await shot(icon(512, 0.3, 0), 512, 512, 'icon-maskable-512.png'); // safe zone: mark inside the inner 40%
await browser.close();
