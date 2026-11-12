import { fail } from '@sveltejs/kit';
import { updateDropzone, updateDropzoneSettings } from '#lib/server/domain/dropzone-admin.ts';
import { bool, optNum, requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { dz } = await requirePage(event, 'dz.settings');
	const s = dz.settings;
	return {
		f: {
			paymentsOn: dz.paymentsOn,
			walletEnabled: dz.walletEnabled,
			walletAllowNegative: dz.walletAllowNegative,
			payAtManifest: dz.payAtManifest,
			staffPayToWallet: !!s.staffPayToWallet,
			indemnityTandemActive: dz.indemnityTandemActive,
			indemnitySportActive: dz.indemnitySportActive,
			emailNotices: dz.emailNotices,
			selfManifest: s.selfManifest !== false,
			requireCheckin: !!s.requireCheckin,
			listed: dz.listed,
			units: s.units ?? 'metric',
			defaultAltitudeFt: s.defaultAltitudeFt ?? null,
			defaultCapacity: s.defaultCapacity ?? null,
			gearWarnDays: s.gearWarnDays ?? null,
			repackIntervalDays: dz.repackIntervalDays
		}
	};
};

function intIn(v: number | null | 'invalid', min: number, max: number): number | null | 'invalid' {
	if (v === null) return null;
	if (v === 'invalid' || !Number.isInteger(v) || v < min || v > max) return 'invalid';
	return v;
}

export const actions: Actions = {
	save: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const f = await event.request.formData();
			const alt = intIn(optNum(f, 'defaultAltitudeFt'), 1000, 40000);
			if (alt === 'invalid') return fail(400, { message: 'Default altitude must be between 1,000 and 40,000 ft.' });
			const cap = intIn(optNum(f, 'defaultCapacity'), 1, 100);
			if (cap === 'invalid') return fail(400, { message: 'Default load size must be between 1 and 100.' });
			const warn = intIn(optNum(f, 'gearWarnDays'), 1, 365);
			if (warn === 'invalid') return fail(400, { message: 'Gear warning must be between 1 and 365 days.' });
			const repack = intIn(optNum(f, 'repackIntervalDays'), 30, 730);
			if (repack === 'invalid') return fail(400, { message: 'Repack interval must be between 30 and 730 days.' });
			const units = str(f, 'units') === 'imperial' ? 'imperial' : 'metric';
			const walletEnabled = bool(f, 'walletEnabled');

			await updateDropzone(event.locals.db, dz.id, {
				paymentsOn: bool(f, 'paymentsOn'),
				walletEnabled,
				walletAllowNegative: walletEnabled && bool(f, 'walletAllowNegative'),
				payAtManifest: bool(f, 'payAtManifest'),
				indemnityTandemActive: bool(f, 'indemnityTandemActive'),
				indemnitySportActive: bool(f, 'indemnitySportActive'),
				emailNotices: bool(f, 'emailNotices'),
				listed: bool(f, 'listed'),
				repackIntervalDays: repack
			});
			await updateDropzoneSettings(event.locals.db, dz.id, {
				staffPayToWallet: walletEnabled && bool(f, 'staffPayToWallet'),
				selfManifest: bool(f, 'selfManifest'),
				requireCheckin: bool(f, 'requireCheckin'),
				units,
				defaultAltitudeFt: alt ?? undefined,
				defaultCapacity: cap ?? undefined,
				gearWarnDays: warn ?? undefined
			});
			return { message: 'Features saved' };
		})
};
