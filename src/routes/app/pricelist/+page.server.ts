import { fail } from '@sveltejs/kit';
import { listPricelist, setPrices } from '#lib/server/domain/pricing.ts';
import { PRICE_CODES } from '#lib/domain/constants.ts';
import { parseMoney } from '#lib/components/staffadmin/money.ts';
import { requirePage, runAction } from '#lib/server/staffadmin/context.ts';
import type { Actions, PageServerLoad } from './$types';

/** Upper bound per item: 10 million in major units — catches typos like an extra few zeros. */
const MAX_MINOR = 10_000_000_00;

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'pricing.manage');
	const items = await listPricelist(event.locals.db, ctx.dz.id);
	return {
		currency: ctx.dz.currency,
		prices: Object.fromEntries(items.map((i) => [i.code, i.amountMinor])) as Record<string, number>,
		unset: items.every((i) => i.amountMinor === 0)
	};
};

export const actions: Actions = {
	save: (event) =>
		runAction(event, 'pricing.manage', async ({ dz }) => {
			const f = await event.request.formData();
			const prices: Record<string, number> = {};
			const errors: Record<string, string> = {};
			for (const code of PRICE_CODES) {
				// Only codes present in the form are updated (a partial post must not zero the rest).
				if (!f.has(code)) continue;
				const raw = String(f.get(code) ?? '');
				const v = raw.trim() === '' ? 0 : parseMoney(raw);
				if (v === null) errors[code] = 'Enter an amount like 450 or 450.00';
				else if (v > MAX_MINOR) errors[code] = 'That amount looks too large';
				else prices[code] = v;
			}
			const n = Object.keys(errors).length;
			if (!n && Object.keys(prices).length === 0) return fail(400, { message: 'Nothing to save.' });
			if (n) return fail(400, { message: `Fix ${n} price${n === 1 ? '' : 's'} before saving.`, errors });
			await setPrices(event.locals.db, dz.id, prices);
			return { message: 'Price list updated' };
		})
};
