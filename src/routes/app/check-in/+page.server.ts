import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { dropzones, slots, users } from '#lib/server/db/schema.ts';
import * as checkins from '#lib/server/domain/checkins.ts';
import * as loads from '#lib/server/domain/loads.ts';
import * as teams from '#lib/server/domain/teams.ts';
import * as indemnity from '#lib/server/domain/indemnity.ts';
import { getRoles, grantRole } from '#lib/server/domain/permissions.ts';
import { getPriceMap } from '#lib/server/domain/pricing.ts';
import { listFollowedDropzones, listPublicDropzones } from '#lib/server/domain/dropzone-admin.ts';
import { getAccount } from '#lib/server/domain/wallet.ts';
import { DomainError } from '#lib/server/domain/errors.ts';
import { localDate } from '#lib/server/domain/time.ts';
import { CHANGE_JUMP_TYPES, TEAM_JUMP_TYPES, loadCard, priceTable } from '#lib/server/jumper/manifest.ts';
import { bool, domainFail, num, requireUser, str } from '#lib/server/jumper/forms.ts';
import { SOLO_JUMP_TYPES, SPORT_EXTRAS, type JumpType, type SlotExtra } from '#lib/domain/constants.ts';
import { membershipWarnings } from '#lib/server/memberships/service.ts';
import { requestDropzone } from '#lib/server/request-cache.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = requireUser(locals, url);
	const { current, memberships } = await parent();
	const db = locals.db;
	const open = await checkins.currentCheckin(db, user.id);

	// Dropzones to choose from: memberships + follows + listed, favourites first.
	const [listed, follows] = await Promise.all([listPublicDropzones(db), listFollowedDropzones(db, user.id)]);
	const fav = new Set(follows.filter((f) => f.favourite).map((f) => f.dropzone.id));
	const followed = new Set(follows.map((f) => f.dropzone.id));
	const member = new Set(memberships.map((m) => m.dropzone.id));
	const byId = new Map(listed.map((d) => [d.id, d]));
	for (const f of follows) byId.set(f.dropzone.id, f.dropzone);
	const choices = [...byId.values()]
		.map((d) => ({ id: d.id, slug: d.slug, name: d.name, address: d.address, lat: d.lat, lng: d.lng, rank: fav.has(d.id) ? 0 : member.has(d.id) ? 1 : followed.has(d.id) ? 2 : 3 }))
		.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

	const preferred = url.searchParams.get('dz') ?? current?.dropzone.slug ?? null;

	if (!open) {
		return { checkin: null, choices, preferred, me: await meDefaults(locals, user.id) };
	}

	const dzId = open.dropzone.id;
	const dz = await requestDropzone(locals, dzId);
	if (!dz) error(404, 'Dropzone not found');
	const today = localDate(Date.now(), dz.timezone);
	const [openLoads, mine, prices, myTeams, needsWaiver, account] = await Promise.all([
		loads.openLoadsToday(db, dz),
		loads.upcomingSlotsForUser(db, user.id, today),
		getPriceMap(db, dzId),
		teams.listUserTeams(db, user.id),
		indemnity.needsSportIndemnity(db, dz, user.id),
		getAccount(db, user.id, dzId)
	]);
	// Came from another DZ's page ("Check in now" there): offer to move the check-in.
	const wanted = url.searchParams.get('dz');
	const switchTo = wanted && wanted !== dz.slug ? (choices.find((c) => c.slug === wanted) ?? null) : null;
	const list = [...openLoads];
	for (const m of mine) {
		if (m.dropzone.id === dzId && !list.some((l) => l.id === m.load.id)) list.push(await loads.getLoad(db, m.load.id));
	}
	list.sort((a, b) => a.day.localeCompare(b.day) || a.loadNumber - b.loadNumber);
	const waiver = needsWaiver ? await indemnity.snapshotForm(db, dzId, 'sport') : null;
	const membershipWarning = (await membershipWarnings(db, [user.id], today))[user.id] ?? null;

	return {
		checkin: {
			id: open.checkin.id,
			dropzone: { id: dz.id, slug: dz.slug, name: dz.name, currency: dz.currency, walletEnabled: dz.walletEnabled },
			checkedInAt: open.checkin.checkedInAt.getTime(),
			weightKg: open.checkin.weightKg,
			gearRental: open.checkin.gearRental,
			verified: open.checkin.verified
		},
		choices,
		preferred,
		membershipWarning,
		me: await meDefaults(locals, user.id),
		loads: list.map((l) => loadCard(l, user.id)),
		prices: priceTable(prices),
		soloTypes: SOLO_JUMP_TYPES,
		teamTypes: TEAM_JUMP_TYPES,
		changeTypes: CHANGE_JUMP_TYPES,
		extras: SPORT_EXTRAS,
		teams: myTeams.map((t) => ({
			id: t.id,
			name: t.name,
			discipline: t.discipline,
			colour: t.colour,
			members: t.members.map((m) => ({ id: m.id, name: m.name })),
			coach: !!t.coachUserId,
			video: !!t.videoUserId
		})),
		waiver,
		switchTo: switchTo ? { id: switchTo.id, name: switchTo.name } : null,
		wallet: account ? { availableMinor: account.availableMinor, pendingMinor: account.pendingMinor, currency: account.currency } : null
	};
};

async function meDefaults(locals: App.Locals, userId: string) {
	const u = (await locals.db.select({ name: users.name, w: users.loadingWeightKg, w2: users.weightKg, licence: users.licence }).from(users).where(eq(users.id, userId)).limit(1))[0];
	return { name: u.name, weightKg: u.w ?? u.w2 ?? null, licence: u.licence };
}

const asJumpType = (v: string, allowed: readonly JumpType[]): JumpType => {
	if (!allowed.includes(v as JumpType)) throw new DomainError('invalid', 'Choose a jump type');
	return v as JumpType;
};
const asExtras = (form: FormData): SlotExtra[] =>
	form
		.getAll('extras')
		.map(String)
		.filter((e): e is SlotExtra => SPORT_EXTRAS.includes(e as SlotExtra));

/** The user's open check-in at the load's dropzone (self-manifest happens where you're checked in). */
async function requireCheckinFor(locals: App.Locals, userId: string, loadId: string) {
	const load = await loads.getLoad(locals.db, loadId);
	const open = await checkins.getOpenCheckin(locals.db, load.dropzoneId, userId);
	if (!open) throw new DomainError('not_checked_in', 'Not checked in');
	return load;
}

export const actions: Actions = {
	checkin: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const dzId = str(form, 'dropzoneId');
		const weightKg = num(form, 'weightKg');
		try {
			if (!dzId) throw new DomainError('invalid', 'Choose a dropzone to check in at');
			if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 200)) {
				throw new DomainError('invalid', 'Enter your exit weight in kg (30–200)');
			}
			const dz = (await locals.db.select({ id: dropzones.id, listed: dropzones.listed }).from(dropzones).where(eq(dropzones.id, dzId)).limit(1))[0];
			if (!dz) throw new DomainError('not_found', 'Dropzone not found');
			// Unlisted dropzones only take check-ins from their members and followers.
			if (!dz.listed) {
				const [roles, follows] = await Promise.all([getRoles(locals.db, user.id, dz.id), listFollowedDropzones(locals.db, user.id)]);
				if (!roles.length && !follows.some((f) => f.dropzone.id === dz.id)) throw new DomainError('not_found', 'Dropzone not found');
			}
			await grantRole(locals.db, { dropzoneId: dz.id, userId: user.id, role: 'jumper' });
			await checkins.checkIn(locals.db, { dropzoneId: dz.id, userId: user.id, weightKg, gearRental: bool(form, 'gearRental') });
		} catch (e) {
			return domainFail(e, { action: 'checkin' });
		}
		return { action: 'checkin', success: 'You’re checked in. Blue skies!' };
	},

	checkout: async ({ locals }) => {
		const user = requireUser(locals);
		const open = await checkins.currentCheckin(locals.db, user.id);
		if (open) await checkins.checkOut(locals.db, { dropzoneId: open.dropzone.id, userId: user.id });
		return { action: 'checkout', success: 'Successfully checked out' };
	},

	update: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const open = await checkins.currentCheckin(locals.db, user.id);
		if (!open) return fail(400, { action: 'update', message: 'You’re not checked in.' });
		const weightKg = num(form, 'weightKg');
		if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 200)) {
			return fail(400, { action: 'update', message: 'Enter your exit weight in kg (30–200)' });
		}
		await checkins.updateCheckin(locals.db, open.checkin.id, { weightKg, gearRental: bool(form, 'gearRental') });
		return { action: 'update', success: 'Check-in updated' };
	},

	join: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const loadId = str(form, 'loadId');
		try {
			const load = await requireCheckinFor(locals, user.id, loadId);
			if (await indemnity.needsSportIndemnity(locals.db, load.dropzoneId, user.id)) {
				return fail(400, { action: 'join', loadId, code: 'indemnity_required', message: 'Please sign the dropzone’s indemnity before your first jump.' });
			}
			const slot = await loads.joinLoad(locals.db, { loadId, userId: user.id, jumpType: asJumpType(str(form, 'jumpType'), SOLO_JUMP_TYPES), extras: asExtras(form) });
			return { action: 'join', loadId, success: `Load ${load.loadNumber} joined successfully`, slotId: slot.id };
		} catch (e) {
			return domainFail(e, { action: 'join', loadId });
		}
	},

	team: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const loadId = str(form, 'loadId');
		const teamId = str(form, 'teamId');
		try {
			const load = await requireCheckinFor(locals, user.id, loadId);
			const team = await teams.getTeam(locals.db, teamId);
			const isMember = team.ownerUserId === user.id || team.members.some((m) => m.id === user.id);
			if (!isMember) throw new DomainError('forbidden', 'Not your team');
			const memberIds = form.getAll('memberIds').map(String).filter((id) => team.members.some((m) => m.id === id));
			if (memberIds.length === 0) throw new DomainError('invalid', 'Select at least one team member');
			if (!load.isOpen) throw new DomainError('load_locked', 'This load is not open for jumpers');
			if (await indemnity.needsSportIndemnity(locals.db, load.dropzoneId, user.id)) {
				return fail(400, { action: 'team', loadId, code: 'indemnity_required', message: 'Please sign the dropzone’s indemnity first.' });
			}
			await teams.manifestTeam(
				locals.db,
				{ teamId, loadId, jumpType: asJumpType(str(form, 'jumpType'), TEAM_JUMP_TYPES), extras: asExtras(form), memberIds, includeStaff: bool(form, 'includeStaff') },
				{ by: user.id, selfManifest: true }
			);
			return { action: 'team', loadId, success: 'Team joined load successfully' };
		} catch (e) {
			if (e instanceof DomainError && e.code === 'already_on_load') {
				return fail(400, { action: 'team', loadId, code: e.code, message: 'Someone in your team is already jumping on this load.' });
			}
			if (e instanceof DomainError && e.code === 'load_full') {
				return fail(400, { action: 'team', loadId, code: e.code, message: 'Not enough space: there aren’t enough slots left on this load for your team.' });
			}
			return domainFail(e, { action: 'team', loadId });
		}
	},

	leave: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const loadId = str(form, 'loadId');
		try {
			await loads.leaveLoad(locals.db, loadId, user.id);
		} catch (e) {
			return domainFail(e, { action: 'leave', loadId });
		}
		return { action: 'leave', loadId, success: 'You left the load' };
	},

	change: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const slotId = str(form, 'slotId');
		try {
			const slot = (await locals.db.select().from(slots).where(and(eq(slots.id, slotId), eq(slots.userId, user.id))).limit(1))[0];
			if (!slot) throw new DomainError('not_found', 'Slot not found');
			if (slot.staffRole) throw new DomainError('forbidden', 'Staff slots are managed by manifest');
			await loads.updateSlot(locals.db, slotId, { jumpType: asJumpType(str(form, 'jumpType'), CHANGE_JUMP_TYPES), extras: asExtras(form) }, { by: user.id, selfService: true });
			return { action: 'change', loadId: slot.loadId, success: 'Jump type has been changed' };
		} catch (e) {
			return domainFail(e, { action: 'change' });
		}
	},

	waiver: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const open = await checkins.currentCheckin(locals.db, user.id);
		if (!open) return fail(400, { action: 'waiver', message: 'You’re not checked in.' });
		const form_ = await indemnity.snapshotForm(locals.db, open.dropzone.id, 'sport');
		const acks = form_.sections.filter((s) => s.type === 'acknowledgement').length;
		if (form.getAll('ack').length < acks) return fail(400, { action: 'waiver', code: 'invalid', message: 'Please tick every acknowledgement (Checkbox missed).' });
		const name = str(form, 'signerName');
		if (name.length < 3) return fail(400, { action: 'waiver', code: 'invalid', message: 'Type your full name to sign.' });
		try {
			await indemnity.signIndemnity(locals.db, { dropzoneId: open.dropzone.id, audience: 'sport', userId: user.id, signerName: name });
		} catch (e) {
			return domainFail(e, { action: 'waiver' });
		}
		return { action: 'waiver', success: 'Signed successfully. Your indemnity is complete — blue skies!' };
	}
};
