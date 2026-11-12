import { fail } from '@sveltejs/kit';
import { maxBytesFor } from '#lib/server/domain/files.ts';
import { readImageUpload } from '#lib/server/images.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { brandingView, removeLogo, resetBranding, saveBrandingStyle, setLogo } from '#lib/server/branding.ts';
import { requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import { brandTheme, normalizeHex, parseThemeChoice, readBranding } from '#lib/branding.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { dz } = await requirePage(event, 'dz.settings');
	const view = brandingView(dz);
	return { branding: { color: view.color, theme: view.theme, logoUrl: view.logoUrl }, dzName: dz.name, dzSlug: dz.slug };
};

export const actions: Actions = {
	style: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const f = await event.request.formData();
			// Two inputs (picker + hex field) work without JS: whichever the user changed wins.
			const previous = readBranding(dz.settings).color ?? '';
			const text = str(f, 'color');
			const picker = str(f, 'colorPicker');
			let color: string | null = text;
			if (normalizeHex(text) === normalizeHex(previous) && normalizeHex(picker) && normalizeHex(picker) !== normalizeHex(previous)) color = picker;
			if (!color) color = null;
			else if (!normalizeHex(color)) return fail(400, { action: 'style', message: 'Enter a colour as a hex code like #FF6A00.' });
			const theme = parseThemeChoice(str(f, 'theme') || null);
			const saved = await saveBrandingStyle(event.locals.db, dz.id, { color, theme });
			const warnings = saved.color ? brandTheme(saved.color).warnings : [];
			return { action: 'style', ok: true, message: warnings.length ? `Branding saved. ${warnings.join(' ')}` : 'Branding saved' };
		}),
	logo: (event) =>
		runAction(event, 'dz.settings', async ({ dz, user }) => {
			const f = await event.request.formData();
			const image = await readImageUpload(f.get('logo'), { maxBytes: maxBytesFor('image/png', 'dz_logo'), label: 'Logo' });
			await setLogo(event.locals.db, await getStorage(), dz.id, image, user.id);
			return { action: 'logo', success: 'Logo updated' };
		}),
	removeLogo: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			await removeLogo(event.locals.db, await getStorage(), dz.id);
			return { action: 'logo', success: 'Logo removed' };
		}),
	reset: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			await resetBranding(event.locals.db, await getStorage(), dz.id);
			return { action: 'style', ok: true, message: 'Branding reset to the default' };
		})
};
