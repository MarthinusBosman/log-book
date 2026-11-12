import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { dropzoneMemberRoles, dropzoneMembers, dropzones } from '#lib/server/db/schema.ts';
import { followDropzone, listAircraft, listFollowedDropzones, unfollowDropzone } from '#lib/server/domain/dropzone-admin.ts';
import { currentCheckin } from '#lib/server/domain/checkins.ts';
import { openLoadsToday } from '#lib/server/domain/loads.ts';
import { getAccount } from '#lib/server/domain/wallet.ts';
import { needsSportIndemnity } from '#lib/server/domain/indemnity.ts';
import { domainFail, requireUser, str } from '#lib/server/jumper/forms.ts';
import { STAFF_ROLES, type DropzoneRole } from '#lib/domain/constants.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, parent }) => {
	const user = requireUser(locals, url);
	const { memberships } = await parent();
	const dz = (await locals.db.select().from(dropzones).where(eq(dropzones.slug, params.slug)).limit(1))[0];
	const member = memberships.find((m) => m.dropzone.id === dz?.id);
	const follows = await listFollowedDropzones(locals.db, user.id);
	const follow = follows.find((f) => f.dropzone.id === dz?.id);
	if (!dz || (!dz.listed && !member && !follow)) error(404, 'Dropzone not found');

	const [roleRows, aircraft, checkin, loads, account, needsWaiver] = await Promise.all([
		locals.db
			.select({ role: dropzoneMemberRoles.role, n: sql<number>`count(*)` })
			.from(dropzoneMemberRoles)
			.innerJoin(dropzoneMembers, and(eq(dropzoneMembers.dropzoneId, dropzoneMemberRoles.dropzoneId), eq(dropzoneMembers.userId, dropzoneMemberRoles.userId)))
			.where(and(eq(dropzoneMemberRoles.dropzoneId, dz.id), eq(dropzoneMembers.status, 'active')))
			.groupBy(dropzoneMemberRoles.role),
		listAircraft(locals.db, dz.id, { activeOnly: true }),
		currentCheckin(locals.db, user.id),
		openLoadsToday(locals.db, dz.id),
		getAccount(locals.db, user.id, dz.id),
		needsSportIndemnity(locals.db, dz.id, user.id)
	]);
	const staffCounts = roleRows
		.filter((r) => STAFF_ROLES.includes(r.role as DropzoneRole))
		.map((r) => ({ role: r.role as DropzoneRole, count: Number(r.n) }))
		.sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role));

	return {
		dz: {
			id: dz.id,
			slug: dz.slug,
			name: dz.name,
			description: dz.description,
			address: dz.address,
			lat: dz.lat,
			lng: dz.lng,
			contactEmail: dz.contactEmail,
			contactPhone: dz.contactPhone,
			website: dz.website,
			openDays: dz.openDays,
			openTime: dz.openTime,
			closeTime: dz.closeTime,
			timezone: dz.timezone,
			currency: dz.currency,
			walletEnabled: dz.walletEnabled,
			/** cache-busting photo URL (the file id changes on every upload) */
			photo: dz.photoFileId ? `/dz/${dz.slug}/photo?v=${dz.photoFileId.slice(0, 8)}` : null
		},
		needsWaiver,
		staffCounts,
		jumpers: Number(roleRows.find((r) => r.role === 'jumper')?.n ?? 0),
		aircraft: aircraft.map((a) => ({ id: a.id, name: a.name, capacity: a.capacity })),
		openLoads: loads.filter((l) => !l.stats.full).length,
		following: !!follow,
		favourite: follow?.favourite ?? false,
		roles: member?.roles ?? [],
		checkedInHere: checkin?.dropzone.id === dz.id,
		checkedInElsewhere: checkin && checkin.dropzone.id !== dz.id ? checkin.dropzone.name : null,
		wallet: account ? { availableMinor: account.availableMinor, currency: account.currency } : null
	};
};

async function dzIdFor(locals: App.Locals, slug: string) {
	const dz = (await locals.db.select({ id: dropzones.id }).from(dropzones).where(eq(dropzones.slug, slug)).limit(1))[0];
	if (!dz) error(404, 'Dropzone not found');
	return dz.id;
}

export const actions: Actions = {
	follow: async ({ locals, params }) => {
		const user = requireUser(locals);
		try {
			await followDropzone(locals.db, await dzIdFor(locals, params.slug), user.id);
		} catch (e) {
			return domainFail(e);
		}
		return { success: 'You’re following this dropzone. You’ll hear about new loads.' };
	},
	unfollow: async ({ locals, params }) => {
		const user = requireUser(locals);
		await unfollowDropzone(locals.db, await dzIdFor(locals, params.slug), user.id);
		return { success: 'Unfollowed' };
	},
	favourite: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const fav = str(await request.formData(), 'favourite') === 'true';
		await followDropzone(locals.db, await dzIdFor(locals, params.slug), user.id, { favourite: fav });
		return { success: fav ? 'Added to favourites' : 'Removed from favourites' };
	}
};
