import { fail } from '@sveltejs/kit';
import { WEEKDAYS, type Weekday } from '#lib/server/db/schema.ts';
import { updateDropzone } from '#lib/server/domain/dropzone-admin.ts';
import { updateDropzoneSlug } from '#lib/server/domain/staff-admin.ts';
import { deleteFile, maxBytesFor, saveFile } from '#lib/server/domain/files.ts';
import { readImageUpload } from '#lib/server/images.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { DZ_COOKIE, checkDropzoneBasics, timezoneList } from '#lib/server/dropzones/index.ts';
import { optNum, optStr, requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import type { Actions, PageServerLoad } from './$types';


export const load: PageServerLoad = async (event) => {
	const { dz } = await requirePage(event, 'dz.settings');
	return {
		dz: {
			name: dz.name,
			slug: dz.slug,
			description: dz.description,
			address: dz.address,
			lat: dz.lat,
			lng: dz.lng,
			country: dz.country,
			timezone: dz.timezone,
			currency: dz.currency,
			contactEmail: dz.contactEmail,
			contactPhone: dz.contactPhone,
			website: dz.website,
			openDays: dz.openDays,
			openTime: dz.openTime,
			closeTime: dz.closeTime,
			photoUrl: dz.photoFileId ? `/app/settings/photo/${dz.photoFileId}` : null
		},
		timezones: timezoneList()
	};
};

export const actions: Actions = {
	save: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			const f = await event.request.formData();
			const name = str(f, 'name');
			if (name.length < 2) return fail(400, { message: 'Enter the dropzone name.' });
			const basics = checkDropzoneBasics({ country: optStr(f, 'country'), timezone: str(f, 'timezone'), currency: str(f, 'currency') });
			if (!basics.ok) return fail(400, { message: basics.message });
			const { country, timezone, currency } = basics;
			const lat = optNum(f, 'lat');
			const lng = optNum(f, 'lng');
			if (lat === 'invalid' || (lat !== null && Math.abs(lat) > 90)) return fail(400, { message: 'Latitude must be between -90 and 90.' });
			if (lng === 'invalid' || (lng !== null && Math.abs(lng) > 180)) return fail(400, { message: 'Longitude must be between -180 and 180.' });
			const email = optStr(f, 'contactEmail');
			if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, { message: 'Enter a valid contact email.' });
			const website = optStr(f, 'website');
			if (website && !/^https?:\/\//i.test(website)) return fail(400, { message: 'Website must start with http:// or https://' });
			const openDays = f.getAll('openDays').map(String).filter((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d));
			const openTime = optStr(f, 'openTime');
			const closeTime = optStr(f, 'closeTime');
			if (openTime && closeTime && openTime >= closeTime) return fail(400, { message: 'Closing time must be after opening time.' });

			const slug = str(f, 'slug');
			if (slug && slug !== dz.slug) {
				const s = await updateDropzoneSlug(event.locals.db, dz.id, slug);
				event.cookies.set(DZ_COOKIE, s, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: event.url.protocol === 'https:',
					maxAge: 60 * 60 * 24 * 365
				});
			}
			await updateDropzone(event.locals.db, dz.id, {
				name,
				description: optStr(f, 'description'),
				address: optStr(f, 'address'),
				lat,
				lng,
				country,
				timezone,
				currency,
				contactEmail: email,
				contactPhone: optStr(f, 'contactPhone'),
				website,
				openDays: WEEKDAYS.filter((d) => openDays.includes(d)),
				openTime,
				closeTime
			});
			return { message: 'Dropzone details saved' };
		}),

	photo: (event) =>
		runAction(event, 'dz.settings', async ({ dz, user }) => {
			const f = await event.request.formData();
			const image = await readImageUpload(f.get('photo'), { maxBytes: maxBytesFor('image/jpeg', 'dz_photo') });
			let storage;
			try {
				storage = await getStorage();
			} catch {
				return fail(503, { message: "File uploads aren't configured on this server yet." });
			}
			const row = await saveFile(event.locals.db, storage, {
				data: image.data,
				mime: image.mime,
				purpose: 'dz_photo',
				ownerUserId: user.id,
				dropzoneId: dz.id
			});
			await updateDropzone(event.locals.db, dz.id, { photoFileId: row.id });
			if (dz.photoFileId) await deleteFile(event.locals.db, storage, dz.photoFileId).catch(() => {});
			return { message: 'Photo updated' };
		}),

	removePhoto: (event) =>
		runAction(event, 'dz.settings', async ({ dz }) => {
			if (!dz.photoFileId) return { message: 'No photo to remove' };
			await updateDropzone(event.locals.db, dz.id, { photoFileId: null });
			const storage = await getStorage().catch(() => null);
			if (storage) await deleteFile(event.locals.db, storage, dz.photoFileId).catch(() => {});
			return { message: 'Photo removed' };
		})
};
