import { jumperDirectory } from '#lib/server/domain/staff-admin.ts';
import { csvMoney, csvResponse, toCsv } from '#lib/server/staffadmin/csv.ts';
import { requirePage } from '#lib/server/staffadmin/context.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const ctx = await requirePage(event, 'checkin.manage', 'payments.manage', 'staff.manage', 'manifest');
	const rows = await jumperDirectory(event.locals.db, ctx.dz.id, ctx.today, { search: event.url.searchParams.get('q') ?? undefined });
	const body = toCsv(rows, [
		{ label: 'Name', value: (r) => r.name },
		{ label: 'Email', value: (r) => r.email },
		{ label: 'Licence', value: (r) => r.licence },
		{ label: 'Association', value: (r) => r.association },
		{ label: 'Association number', value: (r) => r.associationNumber },
		{ label: 'Membership expiry', value: (r) => r.membership.expiry },
		{ label: 'Membership status', value: (r) => r.membership.status },
		{ label: 'Waiver', value: (r) => r.waiver },
		{ label: 'Roles', value: (r) => r.roles.join(' ') },
		{ label: `Available (${ctx.dz.currency})`, value: (r) => csvMoney(r.availableMinor) },
		{ label: `Held (${ctx.dz.currency})`, value: (r) => csvMoney(r.pendingMinor) },
		{ label: 'Checked in', value: (r) => (r.checkedIn ? 'yes' : 'no') }
	]);
	return csvResponse(`jumpers-${ctx.dz.slug}-${ctx.today}.csv`, body);
};
