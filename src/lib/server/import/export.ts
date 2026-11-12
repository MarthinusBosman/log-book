/**
 * Exports in the same normalised bundle format the importer reads, so data can move between
 * instances (hosted ↔ self-hosted) and back. Refs are stable: imported rows keep their original
 * `source_ref`; native rows get `slot:<table>/<id>` (ids are UUIDs, unique across instances).
 */
import { asc, eq, inArray } from 'drizzle-orm';
import type { RatingBody } from '../../domain/constants.ts';
import type { Database } from '../db/index.ts';
import {
	aircraft as aircraftT,
	bookingSlots,
	dropzoneFollows,
	dropzoneMemberRoles,
	dropzones,
	indemnitySections,
	loads as loadsT,
	logbookJumps,
	rigs,
	slots as slotsT,
	tandemPassengers,
	teamMembers,
	teams,
	userRatings,
	users,
	walletAccounts,
	type Rig,
	type User
} from '../db/schema.ts';
import { getPriceMap } from '../domain/pricing.ts';
import { emptyBundle, type BPerson, type BRig, type Bundle } from '../../import/bundle.ts';
import { toCsv } from '../../import/csv.ts';
import { selectIn } from './db.ts';

const nativeRef = (table: string, id: string) => `slot:${table}/${id}`;
const userRef = (u: Pick<User, 'id' | 'sourceRef'>) => u.sourceRef ?? nativeRef('users', u.id);

function personOf(u: User, ratings: { body: string; rating: string; value: string | null; expiresOn: string | null }[], full: boolean): BPerson {
	return {
		ref: userRef(u),
		email: u.email.endsWith('@placeholder.invalid') ? null : u.email,
		name: u.name,
		phone: u.phone,
		address: full ? u.address : null,
		dob: full ? u.dob : null,
		emergencyName: u.emergencyName,
		emergencyPhone: u.emergencyPhone,
		association: u.association,
		associationNumber: u.associationNumber,
		associationExpiry: u.associationExpiry,
		licence: u.licence,
		declaredJumpCount: u.declaredJumpCount,
		weightKg: u.weightKg,
		loadingWeightKg: u.loadingWeightKg,
		marketingOptIn: full ? u.marketingOptIn : null,
		ratings: ratings.map((r) => ({
			body: r.body as RatingBody,
			rating: r.rating,
			value: r.value,
			expiresOn: r.expiresOn
		}))
	};
}

function rigOf(r: Rig): BRig {
	return {
		ref: r.sourceRef ?? nativeRef('rigs', r.id),
		kind: r.kind,
		name: r.name,
		container: r.container,
		mainCanopy: r.mainCanopy,
		mainSizeSqft: r.mainSizeSqft,
		wingLoading: r.wingLoading,
		reserveCanopy: r.reserveCanopy,
		reserveSizeSqft: r.reserveSizeSqft,
		reserveRepackedOn: r.reserveRepackedOn,
		aad: r.aad,
		aadServiceDueOn: r.aadServiceDueOn,
		wingsuit: r.wingsuit,
		notes: r.notes
	};
}

/** Everything a jumper owns here: profile, ratings, logbook, rigs. */
export async function exportJumper(db: Database, userId: string, origin: string | null = null): Promise<Bundle> {
	const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
	if (!u) throw new Error('User not found');
	const ratings = await db.select().from(userRatings).where(eq(userRatings.userId, userId));
	const jumps = await db.select().from(logbookJumps).where(eq(logbookJumps.userId, userId)).orderBy(asc(logbookJumps.jumpNumber));
	const myRigs = await db.select().from(rigs).where(eq(rigs.userId, userId));
	const b = emptyBundle('slot');
	b.source.origin = origin;
	const me = personOf(u, ratings, true);
	b.people = [me];
	b.jumper = {
		person: me.ref,
		jumps: jumps.map((j) => ({
			ref: j.source === 'import' && j.sourceRef ? j.sourceRef : nativeRef('jumps', j.id),
			jumpNumber: j.jumpNumber,
			jumpDate: j.jumpDate,
			location: j.location,
			aircraft: j.aircraft,
			altitudeFt: j.altitudeFt,
			freefallSeconds: j.freefallSeconds,
			jumpType: j.jumpType,
			description: j.description,
			signerName: j.signerName,
			signerLicence: j.signerLicence,
			dzVerified: j.verified
		})),
		rigs: myRigs.map(rigOf),
		wallets: []
	};
	return b;
}

export const LOGBOOK_CSV_HEADER = [
	'Jump #',
	'Date',
	'Dropzone',
	'Aircraft',
	'Altitude (ft)',
	'Freefall (s)',
	'Jump type',
	'Description',
	'Signed by',
	'Signer licence',
	'Verified'
];

export async function exportLogbookCsv(db: Database, userId: string): Promise<string> {
	const jumps = await db.select().from(logbookJumps).where(eq(logbookJumps.userId, userId)).orderBy(asc(logbookJumps.jumpNumber));
	return toCsv(
		LOGBOOK_CSV_HEADER,
		jumps.map((j) => [
			j.jumpNumber,
			j.jumpDate,
			j.location,
			j.aircraft,
			j.altitudeFt,
			j.freefallSeconds,
			j.jumpType,
			j.description,
			j.signerName,
			j.signerLicence,
			j.verified ? 'yes' : ''
		])
	);
}

/** A dropzone's operational data (for moving between instances / self-hosting). */
export async function exportDropzone(db: Database, dropzoneId: string, origin: string | null = null): Promise<Bundle> {
	const dz = (await db.select().from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1))[0];
	if (!dz) throw new Error('Dropzone not found');
	const dzRef = dz.sourceRef ?? nativeRef('dropzones', dz.id);
	const [roles, follows, planes, dzRigs, dzTeams, booking, tandems, sections, dzLoads, wallets, prices] = await Promise.all([
		db.select().from(dropzoneMemberRoles).where(eq(dropzoneMemberRoles.dropzoneId, dz.id)),
		db.select().from(dropzoneFollows).where(eq(dropzoneFollows.dropzoneId, dz.id)),
		db.select().from(aircraftT).where(eq(aircraftT.dropzoneId, dz.id)),
		db.select().from(rigs).where(eq(rigs.dropzoneId, dz.id)),
		db.select().from(teams).where(eq(teams.dropzoneId, dz.id)),
		db.select().from(bookingSlots).where(eq(bookingSlots.dropzoneId, dz.id)),
		db.select().from(tandemPassengers).where(eq(tandemPassengers.dropzoneId, dz.id)),
		db.select().from(indemnitySections).where(eq(indemnitySections.dropzoneId, dz.id)),
		db.select().from(loadsT).where(eq(loadsT.dropzoneId, dz.id)).orderBy(asc(loadsT.day), asc(loadsT.loadNumber)),
		db.select().from(walletAccounts).where(eq(walletAccounts.dropzoneId, dz.id)),
		getPriceMap(db, dz.id)
	]);
	const dzSlots = await db.select().from(slotsT).where(eq(slotsT.dropzoneId, dz.id)).orderBy(asc(slotsT.position));
	const members = await selectIn(
		dzTeams.map((t) => t.id),
		(c) => db.select().from(teamMembers).where(inArray(teamMembers.teamId, c))
	);
	const userIds = new Set<string>();
	roles.forEach((r) => userIds.add(r.userId));
	follows.forEach((f) => userIds.add(f.userId));
	dzSlots.forEach((s) => s.userId && userIds.add(s.userId));
	members.forEach((m) => userIds.add(m.userId));
	dzTeams.forEach((t) => [t.coachUserId, t.videoUserId].forEach((u) => u && userIds.add(u)));
	wallets.forEach((w) => userIds.add(w.userId));
	const people = await selectIn([...userIds], (c) => db.select().from(users).where(inArray(users.id, c)));
	const ratings = await selectIn([...userIds], (c) => db.select().from(userRatings).where(inArray(userRatings.userId, c)));
	const refOf = new Map(people.map((u) => [u.id, userRef(u)]));
	const r = (id: string | null) => (id ? (refOf.get(id) ?? null) : null);
	const tandemRef = new Map(tandems.map((t) => [t.id, t.sourceRef ?? nativeRef('tandems', t.id)]));

	const staff = new Map<string, { person: string; roles: typeof roles[number]['role'][]; colour: string | null }>();
	for (const role of roles) {
		const p = r(role.userId);
		if (!p || role.role === 'jumper') continue;
		const s = staff.get(p) ?? { person: p, roles: [], colour: null };
		s.roles.push(role.role);
		if (role.colour) s.colour = role.colour;
		staff.set(p, s);
	}
	const slotsByLoad = new Map<string, typeof dzSlots>();
	for (const s of dzSlots) slotsByLoad.set(s.loadId, [...(slotsByLoad.get(s.loadId) ?? []), s]);

	const b = emptyBundle('slot');
	b.source.origin = origin;
	b.people = people.map((u) => personOf(u, ratings.filter((x) => x.userId === u.id), false));
	b.dropzone = {
		ref: dzRef,
		name: dz.name,
		description: dz.description,
		address: dz.address,
		lat: dz.lat,
		lng: dz.lng,
		contactEmail: dz.contactEmail,
		contactPhone: dz.contactPhone,
		openDays: dz.openDays,
		openTime: dz.openTime,
		closeTime: dz.closeTime,
		currency: dz.currency,
		timezone: dz.timezone,
		paymentsOn: dz.paymentsOn,
		walletEnabled: dz.walletEnabled,
		payAtManifest: dz.payAtManifest,
		emailNotices: dz.emailNotices,
		indemnityTandemActive: dz.indemnityTandemActive,
		indemnitySportActive: dz.indemnitySportActive,
		prices,
		aircraft: planes.map((a) => ({
			ref: nativeRef('aircraft', a.id),
			name: a.name,
			tailNumber: a.tailNumber,
			capacity: a.capacity,
			weightLimitKg: a.weightLimitKg
		})),
		staff: [...staff.values()],
		followers: follows.map((f) => r(f.userId)).filter((x): x is string => !!x),
		rigs: dzRigs.map(rigOf),
		teams: dzTeams.map((t) => ({
			ref: nativeRef('teams', t.id),
			name: t.name,
			discipline: t.discipline,
			colour: t.colour,
			coach: r(t.coachUserId),
			video: r(t.videoUserId),
			members: members.filter((m) => m.teamId === t.id).map((m) => r(m.userId)).filter((x): x is string => !!x)
		})),
		bookingSlots: booking.map((s) => ({ ref: nativeRef('bookingSlots', s.id), date: s.date, weekday: s.weekday, time: s.time, capacity: s.capacity })),
		tandems: tandems.map((t) => ({
			ref: tandemRef.get(t.id)!,
			confirmationNumber: t.confirmationNumber,
			status: t.status,
			name: t.name,
			email: t.email,
			phone: t.phone,
			idNumber: t.idNumber,
			gender: t.gender,
			dob: t.dob,
			nationality: t.nationality,
			heightCm: t.heightCm,
			weightKg: t.weightKg,
			addressLine1: t.addressLine1,
			addressLine2: t.addressLine2,
			city: t.city,
			postalCode: t.postalCode,
			country: t.country,
			guardianName: t.guardianName,
			guardianEmail: t.guardianEmail,
			guardianIdNumber: t.guardianIdNumber,
			emergencyName: t.emergencyName,
			emergencyEmail: t.emergencyEmail,
			emergencyPhone: t.emergencyPhone,
			jumpDate: t.jumpDate,
			bookingTime: t.bookingTime,
			extras: t.extras,
			heardFrom: t.heardFrom,
			note: t.note,
			indemnitySignedAt: t.indemnitySignedAt?.toISOString() ?? null,
			totalMinor: t.totalMinor,
			depositMinor: t.depositMinor,
			amountPaidMinor: t.amountPaidMinor,
			paymentStatus: t.paymentStatus,
			paymentMethod: t.paymentMethod,
			onlineBooking: t.onlineBooking,
			manifested: t.manifested,
			createdAt: t.createdAt.toISOString()
		})),
		indemnitySections: sections.map((s) => ({ ref: nativeRef('indemnitySections', s.id), audience: s.audience, position: s.position, title: s.title, content: s.content })),
		loads: dzLoads.map((l) => ({
			ref: nativeRef('loads', l.id),
			day: l.day,
			loadNumber: l.loadNumber,
			status: l.status === 'completed' || l.status === 'cancelled' ? l.status : l.status === 'planned' ? 'planned' : 'open',
			isOpen: l.isOpen,
			aircraftName: l.aircraftName,
			capacity: l.capacity,
			weightLimitKg: l.weightLimitKg,
			pilotName: l.pilotName,
			pilotWeightKg: l.pilotWeightKg,
			requirements: l.requirements,
			scheduledAt: l.scheduledAt?.toISOString() ?? null,
			refuel: l.refuel,
			shutdownMinutes: l.shutdownMinutes,
			slots: (slotsByLoad.get(l.id) ?? []).map((s) => ({
				ref: nativeRef('slots', s.id),
				person: r(s.userId),
				displayName: s.displayName,
				email: s.email,
				licence: s.licence,
				weightKg: s.weightKg,
				jumpType: s.jumpType,
				groupId: s.groupId,
				teamName: s.teamName,
				tandem: s.tandemPassengerId ? (tandemRef.get(s.tandemPassengerId) ?? null) : null,
				staffRole: s.staffRole,
				isLoadMaster: s.isLoadMaster,
				extras: s.extras,
				priceLines: s.priceBreakdown,
				depositMinor: s.depositMinor,
				totalMinor: s.totalMinor,
				paid: s.paid,
				staffPayMinor: s.staffPayMinor,
				colour: s.colour,
				position: s.position
			}))
		})),
		wallets: wallets
			.filter((w) => r(w.userId))
			.map((w) => ({
				ref: nativeRef('wallets', w.id),
				person: r(w.userId)!,
				dropzoneRef: dzRef,
				currency: w.currency,
				availableMinor: w.availableMinor,
				lifetimeTopupMinor: w.lifetimeTopupMinor,
				lifetimeSpentMinor: w.lifetimeSpentMinor
			}))
	};
	return b;
}
