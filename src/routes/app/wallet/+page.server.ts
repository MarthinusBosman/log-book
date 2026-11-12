import { listAccountsForUser } from '#lib/server/domain/wallet.ts';
import { requireUser } from '#lib/server/jumper/forms.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = requireUser(locals, url);
	const { memberships, current } = await parent();
	const accounts = await listAccountsForUser(locals.db, user.id);
	const have = new Set(accounts.map((a) => a.dropzone.id));
	return {
		accounts: accounts
			.map((a) => ({ dropzone: a.dropzone, availableMinor: a.account.availableMinor, pendingMinor: a.account.pendingMinor, currency: a.account.currency, lifetimeTopupMinor: a.account.lifetimeTopupMinor, lifetimeSpentMinor: a.account.lifetimeSpentMinor }))
			.sort((a, b) => Number(b.dropzone.id === current?.dropzone.id) - Number(a.dropzone.id === current?.dropzone.id) || a.dropzone.name.localeCompare(b.dropzone.name)),
		others: memberships.filter((m) => !have.has(m.dropzone.id)).map((m) => ({ slug: m.dropzone.slug, name: m.dropzone.name }))
	};
};
