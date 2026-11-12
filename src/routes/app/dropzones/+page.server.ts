import { distanceKm, followDropzone, listFollowedDropzones, listPublicDropzones, unfollowDropzone } from '#lib/server/domain/dropzone-admin.ts';
import { currentCheckin } from '#lib/server/domain/checkins.ts';
import { domainFail, requireUser, str } from '#lib/server/jumper/forms.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = requireUser(locals, url);
	const { memberships } = await parent();
	const q = url.searchParams.get('q')?.trim() ?? '';
	const lat = Number(url.searchParams.get('lat'));
	const lng = Number(url.searchParams.get('lng'));
	const here = url.searchParams.has('lat') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

	const [listed, follows, checkin] = await Promise.all([
		listPublicDropzones(locals.db, { search: q }),
		listFollowedDropzones(locals.db, user.id),
		currentCheckin(locals.db, user.id)
	]);
	const followMap = new Map(follows.map((f) => [f.dropzone.id, f.favourite]));
	const memberIds = new Set(memberships.map((m) => m.dropzone.id));
	const byId = new Map(listed.map((d) => [d.id, d]));
	// followed (even unlisted) DZs show when they match the search
	const needle = q.toLowerCase();
	for (const f of follows) {
		if (!needle || f.dropzone.name.toLowerCase().includes(needle) || (f.dropzone.address ?? '').toLowerCase().includes(needle)) byId.set(f.dropzone.id, f.dropzone);
	}
	const list = [...byId.values()].map((d) => ({
		id: d.id,
		slug: d.slug,
		name: d.name,
		address: d.address,
		description: d.description,
		openDays: d.openDays,
		openTime: d.openTime,
		closeTime: d.closeTime,
		timezone: d.timezone,
		photo: d.photoFileId ? `/dz/${d.slug}/photo?v=${d.photoFileId.slice(0, 8)}` : null,
		following: followMap.has(d.id),
		favourite: followMap.get(d.id) ?? false,
		member: memberIds.has(d.id),
		checkedIn: checkin?.dropzone.id === d.id,
		distanceKm: here && d.lat != null && d.lng != null ? Math.round(distanceKm(here, { lat: d.lat, lng: d.lng }) * 10) / 10 : null
	}));
	list.sort((a, b) =>
		here
			? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name)
			: Number(b.favourite) - Number(a.favourite) || Number(b.following) - Number(a.following) || a.name.localeCompare(b.name)
	);
	return { q, nearMe: !!here, dropzones: list };
};

export const actions: Actions = {
	follow: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const id = str(form, 'dropzoneId');
		try {
			await followDropzone(locals.db, id, user.id);
		} catch (e) {
			return domainFail(e);
		}
		return { success: 'Following' };
	},
	unfollow: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		await unfollowDropzone(locals.db, str(form, 'dropzoneId'), user.id);
		return { success: 'Unfollowed' };
	},
	favourite: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const fav = str(form, 'favourite') === 'true';
		try {
			await followDropzone(locals.db, str(form, 'dropzoneId'), user.id, { favourite: fav });
		} catch (e) {
			return domainFail(e);
		}
		return { success: fav ? 'Added to favourites' : 'Removed from favourites' };
	}
};
