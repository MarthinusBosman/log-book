import { error, redirect } from '@sveltejs/kit';
import { getLoad, listLoadsForDay } from '#lib/server/domain/loads.ts';
import { listCheckedIn } from '#lib/server/domain/checkins.ts';
import { listAircraft, listMembers } from '#lib/server/domain/dropzone-admin.ts';
import { listDropzoneTeams } from '#lib/server/domain/teams.ts';
import { listPassengers } from '#lib/server/domain/tandems.ts';
import { isDomainError } from '#lib/server/domain/errors.ts';
import { localDate } from '#lib/server/domain/time.ts';
import { listUsersWithRole } from '#lib/server/domain/permissions.ts';
import { avatarsOf, tiColours, toLoadVM } from '#lib/server/manifest/board.ts';
import { requireDropzone } from '#lib/server/manifest/context.ts';
import { flagMembershipWarnings, slotPeople } from '#lib/server/memberships/service.ts';
import { loadActions, slotActions } from '#lib/server/manifest/actions.ts';
import { EDITABLE_LOAD_STATUSES } from '#lib/domain/constants.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	event.depends('manifest:board');
	const ctx = await requireDropzone(event, 'loads.view');
	const db = event.locals.db;
	let l;
	try {
		l = await getLoad(db, event.params.loadId);
	} catch (e) {
		if (isDomainError(e, 'not_found')) error(404, 'Load not found');
		throw e;
	}
	if (l.dropzoneId !== ctx.dz.id) error(404, 'Load not found');
	const now = Date.now();
	const canManifest = ctx.caps.includes('manifest');
	const [colours, people] = await Promise.all([tiColours(db, ctx.dz.id), slotPeople(db, l.slots.map((s) => s.userId))]);
	const [load] = await flagMembershipWarnings(db, [toLoadVM(l, colours, avatarsOf(people))], people);
	const editable = EDITABLE_LOAD_STATUSES.includes(l.status);

	const [dayLoads, checked, members, teams, passengers, aircraft, pilots] = await Promise.all([
		listLoadsForDay(db, ctx.dz.id, l.day),
		canManifest ? listCheckedIn(db, ctx.dz.id) : [],
		canManifest ? listMembers(db, ctx.dz.id) : [],
		canManifest ? listDropzoneTeams(db, ctx.dz.id) : [],
		canManifest ? listPassengers(db, ctx.dz.id, { tab: 'ready', date: l.day }) : [],
		canManifest ? listAircraft(db, ctx.dz.id, { activeOnly: true }) : [],
		canManifest ? listUsersWithRole(db, ctx.dz.id, 'pilot') : []
	]);
	const onLoad = new Set(l.slots.map((s) => s.userId).filter(Boolean));
	const staffRoles = new Set(['tandem_instructor', 'videographer', 'coach', 'aff_instructor', 'instructor', 'staff', 'owner', 'admin', 'manifest']);
	const today = localDate(now, ctx.dz.timezone);

	return {
		dz: { id: ctx.dz.id, name: ctx.dz.name, currency: ctx.dz.currency, timezone: ctx.dz.timezone, walletEnabled: ctx.dz.walletEnabled },
		serverNow: now,
		today,
		load,
		editable,
		canManifest,
		canPay: ctx.caps.includes('payments.manage'),
		otherLoads: dayLoads
			.filter((x) => x.id !== l.id && EDITABLE_LOAD_STATUSES.includes(x.status))
			.map((x) => ({ id: x.id, loadNumber: x.loadNumber, free: x.stats.free })),
		checkedIn: checked.map((c) => ({
			id: c.user.id,
			name: c.user.name,
			avatar: c.user.avatar,
			licence: c.user.licence,
			weightKg: c.checkin.weightKg ?? c.user.loadingWeightKg,
			expiry: c.user.associationExpiry,
			expired: !!c.user.associationExpiry && c.user.associationExpiry < l.day,
			gearRental: c.checkin.gearRental,
			onLoad: onLoad.has(c.user.id)
		})),
		members: members
			.filter((m) => m.status === 'active')
			.map((m) => ({ id: m.userId, name: m.name, avatar: m.avatar, licence: m.licence, roles: m.roles.map((r) => r.role), onLoad: onLoad.has(m.userId) })),
		staff: members
			.filter((m) => m.status === 'active' && m.roles.some((r) => staffRoles.has(r.role)))
			.map((m) => ({ id: m.userId, name: m.name, avatar: m.avatar, roles: m.roles.map((r) => r.role), colour: colours[m.userId] ?? null, onLoad: onLoad.has(m.userId) })),
		teams: teams.map((t) => ({ id: t.id, name: t.name, discipline: t.discipline, colour: t.colour })),
		passengers: passengers
			.filter((p) => !p.manifested && (p.status === 'registered' || p.status === 'booked'))
			.map((p) => ({
				id: p.id,
				name: p.name,
				weightKg: p.weightKg,
				extras: p.extras ?? [],
				totalMinor: p.totalMinor,
				depositMinor: p.depositMinor,
				bookingTime: p.bookingTime,
				status: p.status
			})),
		aircraft: aircraft.map((a) => ({ id: a.id, name: a.name, capacity: a.capacity, weightLimitKg: a.weightLimitKg })),
		pilots: pilots.map((p) => ({ id: p.id, name: p.name, weightKg: p.weightKg }))
	};
};

export const actions: Actions = {
	...loadActions,
	...slotActions,
	/** Deleting from the detail page returns to that day's board. */
	deleteLoad: async (event) => {
		const day = await getLoad(event.locals.db, event.params.loadId ?? '').then(
			(l) => l.day,
			() => null
		);
		const res = await loadActions.deleteLoad(event);
		if (res && 'deleted' in res && res.deleted) redirect(303, day ? `/app/manifest?day=${day}` : '/app/manifest');
		return res;
	}
};
