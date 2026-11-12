import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { users } from '#lib/server/db/schema.ts';
import { addRating, changePassword, listRatings, membershipStatus, removeRating, updateProfile } from '#lib/server/domain/profile.ts';
import { deleteFile, maxBytesFor, saveFile } from '#lib/server/domain/files.ts';
import { readImageUpload } from '#lib/server/images.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { DomainError } from '#lib/server/domain/errors.ts';
import { bool, domainFail, int, num, opt, requireUser, str, todayAt } from '#lib/server/jumper/forms.ts';
import { ASSOCIATIONS, KNOWN_RATINGS, RATING_BODIES, type Association, type RatingBody } from '#lib/domain/constants.ts';
import { pasaActions, pasaCheckVM } from '#lib/server/memberships/web.ts';
import { lockedCredentials } from '#lib/server/memberships/service.ts';
import type { Actions, PageServerLoad } from './$types';

const TABS = ['info', 'credentials', 'security'] as const;
const AVATAR_MAX = maxBytesFor('image/jpeg', 'avatar');

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = requireUser(locals, url);
	const { current } = await parent();
	const [u, ratings, today, pasa] = await Promise.all([
		locals.db.select().from(users).where(eq(users.id, user.id)).limit(1),
		listRatings(locals.db, user.id),
		todayAt(locals.db, current?.dropzone.id),
		pasaCheckVM(locals.db, user.id)
	]);
	const me = u[0];
	const tab = (TABS as readonly string[]).includes(url.searchParams.get('tab') ?? '') ? (url.searchParams.get('tab') as (typeof TABS)[number]) : 'info';
	return {
		tab,
		today,
		profile: {
			name: me.name,
			email: me.email,
			phone: me.phone,
			address: me.address,
			dob: me.dob,
			emergencyName: me.emergencyName,
			emergencyPhone: me.emergencyPhone,
			marketingOptIn: me.marketingOptIn,
			avatar: me.avatar,
			association: me.association,
			associationNumber: me.associationNumber,
			associationExpiry: me.associationExpiry,
			associationVerified: !!me.associationVerifiedAt,
			licence: me.licence,
			declaredJumpCount: me.declaredJumpCount,
			weightKg: me.weightKg,
			loadingWeightKg: me.loadingWeightKg
		},
		membership: membershipStatus(me, today),
		ratings: ratings.map((r) => ({ id: r.id, body: r.body, rating: r.rating, expiresOn: r.expiresOn, verified: !!r.verifiedAt })),
		knownRatings: KNOWN_RATINGS,
		pasa
	};
};

const weight = (form: FormData, key: string, label: string) => {
	const v = num(form, key);
	if (v !== null && (!Number.isFinite(v) || v < 30 || v > 250)) throw new DomainError('invalid', `${label} must be between 30 and 250 kg`);
	return v;
};

export const actions: Actions = {
	...pasaActions,
	info: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		try {
			await updateProfile(locals.db, user.id, {
				name: str(form, 'name'),
				phone: opt(form, 'phone'),
				address: opt(form, 'address'),
				dob: opt(form, 'dob'),
				emergencyName: opt(form, 'emergencyName'),
				emergencyPhone: opt(form, 'emergencyPhone'),
				marketingOptIn: bool(form, 'marketingOptIn')
			});
		} catch (e) {
			return domainFail(e, { action: 'info' });
		}
		return { action: 'info', success: 'Profile saved' };
	},

	credentials: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		try {
			// While linked to PASA, the association owns these fields (the form shows them read-only).
			const locked = await lockedCredentials(locals.db, user.id);
			if (locked) for (const [k, v] of Object.entries(locked)) form.set(k, v ?? '');
			const assoc = str(form, 'association');
			if (assoc && !ASSOCIATIONS.includes(assoc as Association)) throw new DomainError('invalid', 'Unknown association');
			const jumps = int(form, 'declaredJumpCount');
			if (jumps !== null && !Number.isFinite(jumps)) throw new DomainError('invalid', 'Number of jumps must be a whole number');
			const expiry = opt(form, 'associationExpiry');
			if (assoc && !expiry) throw new DomainError('invalid', 'Please set your membership expiry date');
			await updateProfile(locals.db, user.id, {
				association: (assoc || null) as Association | null,
				associationNumber: opt(form, 'associationNumber'),
				associationExpiry: expiry,
				licence: opt(form, 'licence'),
				declaredJumpCount: jumps ?? 0,
				weightKg: weight(form, 'weightKg', 'Body weight'),
				loadingWeightKg: weight(form, 'loadingWeightKg', 'Exit weight')
			});
		} catch (e) {
			return domainFail(e, { action: 'credentials' });
		}
		return { action: 'credentials', success: 'Credentials updated successfully' };
	},

	addRating: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		try {
			const body = str(form, 'body') as RatingBody;
			if (!RATING_BODIES.includes(body)) throw new DomainError('invalid', 'Choose an association');
			await addRating(locals.db, user.id, { body, rating: str(form, 'rating'), expiresOn: opt(form, 'expiresOn') });
		} catch (e) {
			return domainFail(e, { action: 'rating' });
		}
		return { action: 'rating', success: 'Rating added' };
	},

	removeRating: async ({ locals, request }) => {
		const user = requireUser(locals);
		try {
			await removeRating(locals.db, user.id, str(await request.formData(), 'id'));
		} catch (e) {
			return domainFail(e, { action: 'rating' });
		}
		return { action: 'rating', success: 'Rating removed' };
	},

	avatar: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		try {
			// With JS the browser sends a ~256 px WebP; without JS the original (capped, metadata stripped).
			const { data, mime } = await readImageUpload(form.get('avatar'), { maxBytes: AVATAR_MAX });
			const storage = await getStorage();
			const old = (await locals.db.select({ f: users.avatarFileId }).from(users).where(eq(users.id, user.id)).limit(1))[0]?.f;
			const row = await saveFile(locals.db, storage, { data, mime, purpose: 'avatar', ownerUserId: user.id });
			await updateProfile(locals.db, user.id, { avatarFileId: row.id, avatar: `/app/profile/avatar/${row.id}` });
			if (old) await deleteFile(locals.db, storage, old).catch(() => {});
		} catch (e) {
			return domainFail(e, { action: 'avatar' });
		}
		return { action: 'avatar', success: 'Profile picture has been updated' };
	},

	removeAvatar: async ({ locals }) => {
		const user = requireUser(locals);
		const old = (await locals.db.select({ f: users.avatarFileId }).from(users).where(eq(users.id, user.id)).limit(1))[0]?.f;
		await updateProfile(locals.db, user.id, { avatarFileId: null, avatar: null });
		if (old) await deleteFile(locals.db, await getStorage(), old).catch(() => {});
		return { action: 'avatar', success: 'Profile picture removed' };
	},

	password: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const next = String(form.get('next') ?? '');
		if (next !== String(form.get('confirm') ?? '')) return fail(400, { action: 'password', message: 'The new passwords don’t match' });
		try {
			await changePassword(locals.db, { userId: user.id, current: String(form.get('current') ?? ''), next, keepSessionId: locals.session?.id ?? null });
		} catch (e) {
			return domainFail(e, { action: 'password' });
		}
		return { action: 'password', success: 'Password changed. Other devices have been signed out.' };
	}
};
