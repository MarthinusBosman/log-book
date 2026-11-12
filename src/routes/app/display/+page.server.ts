import { DomainError } from '#lib/server/domain/errors.ts';
import { requireDropzone, runAction } from '#lib/server/manifest/context.ts';
import { displayData, displayTokenOf, newDisplayToken, setDisplayToken } from '#lib/server/manifest/display.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	event.depends('manifest:display');
	const ctx = await requireDropzone(event, 'loads.view');
	const canShare = ctx.caps.includes('dz.settings');
	const token = canShare ? displayTokenOf(ctx.dz) : null;
	return {
		...(await displayData(event.locals.db, ctx.dz, event.url.searchParams.get('day'))),
		canShare,
		publicUrl: token ? `${event.url.origin}/dz/${ctx.dz.slug}/display?token=${encodeURIComponent(token)}` : null
	};
};

/** Owner/admin: create, rotate or turn off the public (no-login) display link. */
export const actions: Actions = {
	publicLink: async (event) => {
		const form = await event.request.formData();
		const ctx = await requireDropzone(event, 'loads.view');
		return runAction('publicLink', async () => {
			if (!ctx.caps.includes('dz.settings')) throw new DomainError('forbidden', 'forbidden');
			const off = form.get('mode') === 'off';
			await setDisplayToken(event.locals.db, ctx.dz.id, off ? null : newDisplayToken());
			return { ok: true, action: 'publicLink', enabled: !off };
		});
	}
};
