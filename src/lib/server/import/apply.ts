/**
 * Bundle → database. Idempotent: every entity is keyed by its bundle `ref` (via `source_ref`
 * where the table has one, deterministic ids otherwise), so a re-import updates rows and never
 * duplicates them. Every run is recorded in `import_jobs` (status, counts, warnings).
 *
 * Trust model:
 *  - jumper imports only touch the importing user's own logbook/rigs/blank profile fields;
 *    wallet balances are never taken from a personal import (a file could claim any balance)
 *  - dropzone imports require `dz.settings` on the target dropzone; owner/admin roles from a
 *    file are only ever given to the importing user
 *  - imported loads/slots are written as history: no wallet holds, charges or notifications
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import {
	aircraft as aircraftT,
	bookingSlots as bookingSlotsT,
	dropzones,
	indemnitySections as sectionsT,
	ledgerEntries,
	loads as loadsT,
	logbookJumps,
	rigs as rigsT,
	slots as slotsT,
	tandemPassengers,
	teamMembers,
	teams as teamsT,
	userRatings,
	users,
	type Dropzone,
	type ImportCounts,
	type User,
	WEEKDAYS
} from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { generateConfirmationNumber } from '../domain/tandems.ts';
import { ensureMember, grantRole, requireCan } from '../domain/permissions.ts';
import { setPrices } from '../domain/pricing.ts';
import { followDropzone } from '../domain/dropzone-admin.ts';
import { adjust, getOrCreateAccount, topUp } from '../domain/wallet.ts';
import { nextJumpNumber } from '../domain/logbook.ts';
import { finishImportJob, startImportJob } from '../domain/imports.ts';
import { JUMP_TYPES, type DropzoneRole } from '../../domain/constants.ts';
import { countBundle, type BPerson, type BRig, type Bundle, type BundleCounts } from '../../import/bundle.ts';
import { deterministicId, runChunked, selectIn, upsertStatements } from './db.ts';

export type ImportMode = 'jumper' | 'dropzone';
export type ImportContext = {
	userId: string;
	mode: ImportMode;
	/** Target dropzone (dropzone mode). */
	dropzoneId?: string | null;
	/** `jumpmaster` for connector / raw-docs imports, `file` for bundle and CSV uploads. */
	source?: 'jumpmaster' | 'file';
	now?: number;
	/** Extra warnings from earlier stages (mapping, CSV parsing) recorded in the job log. */
	warnings?: string[];
};

export type ImportResult = { jobId: string; ok: boolean; counts: BundleCounts; warnings: string[]; error?: string };

const MAX_LOG = 200;

class Tally {
	counts: BundleCounts = {};
	warnings: string[] = [];
	add(k: string, n = 1) {
		if (n) this.counts[k] = (this.counts[k] ?? 0) + n;
	}
	warn(w: string) {
		if (!this.warnings.includes(w)) this.warnings.push(w);
	}
}

/** Placeholder email for people without one (never deliverable: `.invalid` TLD). */
export function placeholderEmail(personRef: string): string {
	return `import-${deterministicId('email', personRef).slice(0, 13)}@placeholder.invalid`;
}

/** Run an import, recording an import_jobs row. Never throws for bad data; returns ok=false. */
export async function importBundle(db: Database, bundle: Bundle, ctx: ImportContext): Promise<ImportResult> {
	const now = ctx.now ?? Date.now();
	const job = await startImportJob(db, ctx.userId, ctx.source ?? 'file', now);
	const t = new Tally();
	for (const w of ctx.warnings ?? []) t.warn(w);
	try {
		if (ctx.mode === 'jumper') await applyJumper(db, bundle, ctx, t, now);
		else await applyDropzone(db, bundle, ctx, t, now);
		await finishImportJob(db, job.id, { ok: true, counts: t.counts as ImportCounts, log: t.warnings.slice(0, MAX_LOG) }, Date.now());
		return { jobId: job.id, ok: true, counts: t.counts, warnings: t.warnings };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		await finishImportJob(
			db,
			job.id,
			{ ok: false, counts: t.counts as ImportCounts, log: t.warnings.slice(0, MAX_LOG), error: message },
			Date.now()
		);
		return { jobId: job.id, ok: false, counts: t.counts, warnings: t.warnings, error: message };
	}
}

// ── people ───────────────────────────────────────────────────────────────────

function profileFields(p: BPerson) {
	return {
		phone: p.phone ?? null,
		address: p.address ?? null,
		dob: p.dob ?? null,
		emergencyName: p.emergencyName ?? null,
		emergencyPhone: p.emergencyPhone ?? null,
		association: p.association ?? null,
		associationNumber: p.associationNumber ?? null,
		associationExpiry: p.associationExpiry ?? null,
		licence: p.licence ?? null,
		weightKg: p.weightKg ?? null,
		loadingWeightKg: p.loadingWeightKg ?? null
	};
}

/** Only fill blanks on a real user's profile (never overwrite what they typed here). */
function blankFill(u: User, p: BPerson): Partial<User> {
	const patch: Partial<User> = {};
	const f = profileFields(p);
	for (const [k, v] of Object.entries(f) as [keyof typeof f, unknown][]) {
		if (v != null && (u[k] == null || u[k] === '')) (patch as Record<string, unknown>)[k] = v;
	}
	if (p.declaredJumpCount != null && p.declaredJumpCount > (u.declaredJumpCount ?? 0)) patch.declaredJumpCount = p.declaredJumpCount;
	return patch;
}

async function importRatings(db: Database, userId: string, p: BPerson, t: Tally) {
	if (!p.ratings?.length) return;
	const rows = p.ratings.map((r) => ({
		id: newId(),
		userId,
		body: r.body,
		rating: r.rating,
		value: r.value ?? null,
		expiresOn: r.expiresOn ?? null
	}));
	const res = await db.insert(userRatings).values(rows).onConflictDoNothing().returning({ id: userRatings.id });
	t.add('ratings', res.length);
}

/**
 * Resolve bundle people to user ids: by source_ref, then email; unknown people become
 * placeholder profiles (no password — they can claim the account with "forgot password").
 */
async function resolvePeople(
	db: Database,
	people: BPerson[],
	opts: { importerId: string; mapToImporter: Set<string>; now: number },
	t: Tally
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (!people.length) return map;
	const refs = people.map((p) => p.ref);
	const emails = people.map((p) => p.email).filter((e): e is string => !!e);
	const byRef = await selectIn(refs, (c) => db.select().from(users).where(inArray(users.sourceRef, c)));
	const byEmail = await selectIn(emails, (c) => db.select().from(users).where(inArray(users.email, c)));
	const refMap = new Map(byRef.map((u) => [u.sourceRef!, u]));
	const emailMap = new Map(byEmail.map((u) => [u.email, u]));
	const importer = (await db.select().from(users).where(eq(users.id, opts.importerId)).limit(1))[0];
	for (const p of people) {
		let u = refMap.get(p.ref) ?? (p.email ? emailMap.get(p.email) : undefined);
		if (!u && opts.mapToImporter.has(p.ref)) u = importer;
		if (u) {
			map.set(p.ref, u.id);
			const patch: Partial<User> = u.passwordHash ? {} : { ...profileFields(p), name: p.name };
			for (const k of Object.keys(patch) as (keyof User)[]) if (patch[k] == null) delete patch[k];
			if (!u.sourceRef && p.ref.startsWith('jm:') && !refMap.has(p.ref)) {
				patch.sourceRef = p.ref;
				refMap.set(p.ref, u);
			}
			if (Object.keys(patch).length) await db.update(users).set({ ...patch, updatedAt: new Date(opts.now) }).where(eq(users.id, u.id));
			if (!u.passwordHash) await importRatings(db, u.id, p, t);
			t.add('people.matched');
			continue;
		}
		const email = p.email && !emailMap.has(p.email) ? p.email : placeholderEmail(p.ref);
		const row = (
			await db
				.insert(users)
				.values({
					id: newId(),
					email,
					name: p.name,
					...profileFields(p),
					declaredJumpCount: p.declaredJumpCount ?? 0,
					marketingOptIn: false,
					sourceRef: p.ref,
					createdAt: new Date(opts.now),
					updatedAt: new Date(opts.now)
				})
				.returning()
		)[0];
		refMap.set(p.ref, row);
		emailMap.set(email, row);
		map.set(p.ref, row.id);
		await importRatings(db, row.id, p, t);
		t.add('placeholders');
	}
	return map;
}

// ── rigs ─────────────────────────────────────────────────────────────────────

async function importRigs(db: Database, owner: { userId: string } | { dropzoneId: string }, list: BRig[], t: Tally, now: number) {
	if (!list.length) return;
	const where =
		'userId' in owner ? eq(rigsT.userId, owner.userId) : eq(rigsT.dropzoneId, owner.dropzoneId);
	const existing = await selectIn(
		list.map((r) => r.ref),
		(c) => db.select({ id: rigsT.id, sourceRef: rigsT.sourceRef }).from(rigsT).where(and(where, inArray(rigsT.sourceRef, c)))
	);
	const ids = new Map(existing.map((r) => [r.sourceRef!, r.id]));
	const rows = list.map((r) => ({
		id: ids.get(r.ref) ?? newId(),
		kind: 'userId' in owner ? ('personal' as const) : (r.kind ?? 'rental'),
		userId: 'userId' in owner ? owner.userId : null,
		dropzoneId: 'dropzoneId' in owner ? owner.dropzoneId : null,
		name: r.name ?? null,
		container: r.container ?? null,
		mainCanopy: r.mainCanopy ?? null,
		mainSizeSqft: r.mainSizeSqft ?? null,
		wingLoading: r.wingLoading ?? null,
		reserveCanopy: r.reserveCanopy ?? null,
		reserveSizeSqft: r.reserveSizeSqft ?? null,
		reserveRepackedOn: r.reserveRepackedOn ?? null,
		aad: r.aad ?? null,
		aadServiceDueOn: r.aadServiceDueOn ?? null,
		wingsuit: r.wingsuit ?? null,
		notes: r.notes ?? null,
		sourceRef: r.ref,
		createdAt: new Date(now),
		updatedAt: new Date(now)
	}));
	await runChunked(
		db,
		upsertStatements(db, rigsT, rows, rigsT.id, [
			'name',
			'container',
			'mainCanopy',
			'mainSizeSqft',
			'wingLoading',
			'reserveCanopy',
			'reserveSizeSqft',
			'reserveRepackedOn',
			'aad',
			'aadServiceDueOn',
			'wingsuit',
			'notes',
			'kind',
			'updatedAt'
		])
	);
	t.add('rigs', rows.length);
	t.add('rigs.updated', ids.size);
}

// ── jumper ───────────────────────────────────────────────────────────────────

async function applyJumper(db: Database, b: Bundle, ctx: ImportContext, t: Tally, now: number) {
	const j = b.jumper;
	if (!j) throw new Error('This file has no personal logbook data. Use the dropzone import for dropzone data.');
	const self = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
	if (!self) throw new Error('User not found');
	const person = b.people.find((p) => p.ref === j.person);
	if (person) {
		const patch = blankFill(self, person);
		if (person.ref.startsWith('jm:') && !self.sourceRef) {
			const taken = (await db.select({ id: users.id }).from(users).where(eq(users.sourceRef, person.ref)).limit(1))[0];
			if (!taken) patch.sourceRef = person.ref;
			else
				t.warn(
					'A dropzone already imported a placeholder profile for this Jump Master account. Your logbook was still imported; ask the dropzone to merge the two profiles.'
				);
		}
		if (Object.keys(patch).length) {
			await db.update(users).set({ ...patch, updatedAt: new Date(now) }).where(eq(users.id, self.id));
			t.add('profile', Object.keys(patch).filter((k) => k !== 'sourceRef').length);
		}
		await importRatings(db, self.id, person, t);
	}

	// Logbook
	const jumps = j.jumps ?? [];
	if (jumps.length) {
		const existing = await selectIn(
			jumps.map((x) => x.ref),
			(c) =>
				db
					.select({ ref: logbookJumps.sourceRef, n: logbookJumps.jumpNumber })
					.from(logbookJumps)
					.where(and(eq(logbookJumps.userId, self.id), eq(logbookJumps.source, 'import'), inArray(logbookJumps.sourceRef, c)))
		);
		const existingNo = new Map(existing.map((e) => [e.ref!, e.n]));
		// Link the free-text location to a dropzone here when the names match.
		const names = [...new Set(jumps.map((x) => x.location?.trim().toLowerCase()).filter((x): x is string => !!x))];
		const dzByName = new Map<string, string>();
		for (const chunk of await selectIn(names, (c) =>
			db.select({ id: dropzones.id, name: sql<string>`lower(${dropzones.name})` }).from(dropzones).where(inArray(sql`lower(${dropzones.name})`, c))
		))
			dzByName.set(chunk.name, chunk.id);
		let next = await nextJumpNumber(db, self.id);
		const sorted = [...jumps].sort((a, b2) => a.jumpDate.localeCompare(b2.jumpDate));
		const numbers = new Map<string, number>();
		for (const x of sorted) {
			const n = x.jumpNumber ?? existingNo.get(x.ref) ?? next++;
			numbers.set(x.ref, n);
		}
		const rows = jumps.map((x) => ({
			id: newId(),
			userId: self.id,
			jumpNumber: numbers.get(x.ref)!,
			jumpDate: x.jumpDate,
			dropzoneId: x.location ? (dzByName.get(x.location.trim().toLowerCase()) ?? null) : null,
			location: x.location ?? null,
			aircraft: x.aircraft ?? null,
			altitudeFt: x.altitudeFt != null ? Math.round(x.altitudeFt) : null,
			freefallSeconds: x.freefallSeconds != null ? Math.round(x.freefallSeconds) : null,
			jumpType: x.jumpType && (JUMP_TYPES as readonly string[]).includes(x.jumpType) ? x.jumpType : (x.jumpType ? 'other' : null),
			description: x.description ?? null,
			signerName: x.signerName ?? null,
			signerLicence: x.signerLicence ?? null,
			verified: false,
			source: 'import' as const,
			sourceRef: x.ref,
			createdAt: new Date(now),
			updatedAt: new Date(now)
		}));
		await runChunked(
			db,
			upsertStatements(db, logbookJumps, rows, [logbookJumps.userId, logbookJumps.source, logbookJumps.sourceRef], [
				'jumpNumber',
				'jumpDate',
				'location',
				'aircraft',
				'altitudeFt',
				'freefallSeconds',
				'jumpType',
				'description',
				'signerName',
				'signerLicence',
				'updatedAt'
			])
		);
		t.add('jumps', rows.length);
		t.add('jumps.updated', existingNo.size);
		t.add('jumps.created', rows.length - existingNo.size);
	}

	await importRigs(db, { userId: self.id }, j.rigs ?? [], t, now);

	if (j.wallets?.length) {
		t.add('skipped', j.wallets.length);
		t.warn(
			`${j.wallets.length} wallet balance(s) were not imported: balances are carried over by the dropzone, not from a personal import.`
		);
	}
}

// ── dropzone ─────────────────────────────────────────────────────────────────

const OWNERISH: DropzoneRole[] = ['owner', 'admin'];

async function applyDropzone(db: Database, b: Bundle, ctx: ImportContext, t: Tally, now: number) {
	const src = b.dropzone;
	if (!src) throw new Error('This file has no dropzone data.');
	if (!ctx.dropzoneId) throw new Error('Choose the dropzone to import into.');
	await requireCan(db, ctx.userId, ctx.dropzoneId, 'dz.settings');
	const dz = (await db.select().from(dropzones).where(eq(dropzones.id, ctx.dropzoneId)).limit(1))[0] as Dropzone;
	const scope = dz.id;
	const id = (ref: string) => deterministicId(scope, ref);

	// Profile + switches (only fields the source provides; currency/timezone never change here).
	const patch: Partial<Dropzone> = {};
	const set = <K extends keyof Dropzone>(k: K, v: Dropzone[K] | null | undefined) => {
		if (v !== undefined && v !== null && v !== '') patch[k] = v as Dropzone[K];
	};
	set('description', src.description);
	set('address', src.address);
	set('lat', src.lat);
	set('lng', src.lng);
	set('contactEmail', src.contactEmail);
	set('contactPhone', src.contactPhone);
	if (src.openDays?.length) patch.openDays = src.openDays.filter((d) => (WEEKDAYS as readonly string[]).includes(d)) as Dropzone['openDays'];
	if (src.openTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(src.openTime)) patch.openTime = src.openTime;
	if (src.closeTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(src.closeTime)) patch.closeTime = src.closeTime;
	for (const k of ['paymentsOn', 'walletEnabled', 'payAtManifest', 'emailNotices', 'indemnityTandemActive', 'indemnitySportActive'] as const) {
		if (typeof src[k] === 'boolean') patch[k] = src[k];
	}
	if (!dz.sourceRef) patch.sourceRef = src.ref;
	else if (dz.sourceRef !== src.ref) t.warn('This dropzone was previously imported from a different source dropzone.');
	if (src.currency && src.currency !== dz.currency) {
		t.warn(`Source currency is ${src.currency} but this dropzone uses ${dz.currency}; amounts were imported as ${dz.currency}.`);
	}
	if (Object.keys(patch).length) await db.update(dropzones).set(patch).where(eq(dropzones.id, dz.id));
	t.add('dropzone');

	if (src.prices && Object.keys(src.prices).length) {
		await setPrices(db, dz.id, src.prices, now);
		t.add('prices', Object.keys(src.prices).length);
	}

	// People: the source owner(s) map to the importing user when they don't exist here yet.
	const ownerRefs = new Set((src.staff ?? []).filter((s) => s.roles.includes('owner')).map((s) => s.person));
	const people = await resolvePeople(db, b.people, { importerId: ctx.userId, mapToImporter: ownerRefs, now }, t);
	const uid = (ref: string | null | undefined) => (ref ? (people.get(ref) ?? null) : null);

	// Staff roles
	for (const s of src.staff ?? []) {
		const userId = uid(s.person);
		if (!userId) continue;
		for (let role of s.roles) {
			if (OWNERISH.includes(role) && userId !== ctx.userId) {
				t.warn('Owner/admin roles from the file were given as Manifest; promote people yourself in Staff settings.');
				role = 'manifest';
			}
			if (role === 'owner' && userId === ctx.userId) continue;
			await grantRole(db, { dropzoneId: dz.id, userId, role, colour: s.colour ?? null });
		}
		t.add('staff');
	}
	for (const f of src.followers ?? []) {
		const userId = uid(f);
		if (userId) {
			await followDropzone(db, dz.id, userId);
			t.add('followers');
		}
	}

	// Aircraft (match by deterministic id, then by name)
	const existingAircraft = await db.select().from(aircraftT).where(eq(aircraftT.dropzoneId, dz.id));
	const aircraftIdByName = new Map<string, string>();
	const aircraftRows = (src.aircraft ?? []).map((a) => {
		const byName = existingAircraft.find((x) => x.name.toLowerCase() === a.name.toLowerCase());
		const rowId = existingAircraft.some((x) => x.id === id(a.ref)) ? id(a.ref) : (byName?.id ?? id(a.ref));
		aircraftIdByName.set(a.name.toLowerCase(), rowId);
		return {
			id: rowId,
			dropzoneId: dz.id,
			name: a.name,
			tailNumber: a.tailNumber ?? null,
			capacity: a.capacity,
			weightLimitKg: a.weightLimitKg ?? null,
			active: true,
			createdAt: new Date(now)
		};
	});
	for (const a of existingAircraft) if (!aircraftIdByName.has(a.name.toLowerCase())) aircraftIdByName.set(a.name.toLowerCase(), a.id);
	await runChunked(db, upsertStatements(db, aircraftT, aircraftRows, aircraftT.id, ['name', 'tailNumber', 'capacity', 'weightLimitKg']));
	t.add('aircraft', aircraftRows.length);

	await importRigs(db, { dropzoneId: dz.id }, src.rigs ?? [], t, now);

	// Teams
	const teamIdByName = new Map<string, string>();
	if (src.teams?.length) {
		const rows = src.teams.map((tm) => {
			teamIdByName.set(tm.name.toLowerCase(), id(tm.ref));
			return {
				id: id(tm.ref),
				dropzoneId: dz.id,
				ownerUserId: null,
				name: tm.name,
				discipline: tm.discipline ?? null,
				colour: tm.colour ?? null,
				coachUserId: uid(tm.coach),
				videoUserId: uid(tm.video),
				createdAt: new Date(now)
			};
		});
		await runChunked(db, upsertStatements(db, teamsT, rows, teamsT.id, ['name', 'discipline', 'colour', 'coachUserId', 'videoUserId']));
		const members = src.teams.flatMap((tm) =>
			tm.members.map((m) => uid(m)).filter((u): u is string => !!u).map((userId) => ({ teamId: id(tm.ref), userId, createdAt: new Date(now) }))
		);
		for (const m of members) await ensureMember(db, dz.id, m.userId);
		if (members.length) await db.insert(teamMembers).values(members).onConflictDoNothing();
		t.add('teams', rows.length);
	}

	// Booking slots (dedupe on date/weekday/time — NULLs defeat the unique index)
	if (src.bookingSlots?.length) {
		const existing = await db.select().from(bookingSlotsT).where(eq(bookingSlotsT.dropzoneId, dz.id));
		const key = (d: string | null | undefined, w: number | null | undefined, time: string) => `${d ?? ''}|${w ?? ''}|${time}`;
		const byKey = new Map(existing.map((s) => [key(s.date, s.weekday, s.time), s.id]));
		const rows = src.bookingSlots.map((s) => ({
			id: byKey.get(key(s.date, s.weekday, s.time)) ?? id(s.ref),
			dropzoneId: dz.id,
			date: s.date ?? null,
			weekday: s.date ? null : (s.weekday ?? null),
			time: s.time,
			capacity: s.capacity,
			createdAt: new Date(now)
		}));
		await runChunked(db, upsertStatements(db, bookingSlotsT, rows, bookingSlotsT.id, ['capacity']));
		t.add('bookingSlots', rows.length);
	}

	// Tandem passengers (source_ref within this DZ)
	const tandemIdByRef = new Map<string, string>();
	if (src.tandems?.length) {
		const existing = await selectIn(
			src.tandems.map((x) => x.ref),
			(c) =>
				db
					.select({ id: tandemPassengers.id, ref: tandemPassengers.sourceRef, conf: tandemPassengers.confirmationNumber })
					.from(tandemPassengers)
					.where(and(eq(tandemPassengers.dropzoneId, dz.id), inArray(tandemPassengers.sourceRef, c)))
		);
		const byRef = new Map(existing.map((e) => [e.ref!, e]));
		const confs = src.tandems.map((x) => x.confirmationNumber).filter((c): c is string => !!c);
		const taken = new Set(
			(await selectIn(confs, (c) =>
				db.select({ conf: tandemPassengers.confirmationNumber, ref: tandemPassengers.sourceRef }).from(tandemPassengers).where(inArray(tandemPassengers.confirmationNumber, c))
			))
				.filter((r) => !src.tandems!.some((x) => x.ref === r.ref))
				.map((r) => r.conf)
		);
		const rows = src.tandems.map((x) => {
			const prev = byRef.get(x.ref);
			const rowId = prev?.id ?? newId();
			tandemIdByRef.set(x.ref, rowId);
			let conf = prev?.conf ?? x.confirmationNumber ?? generateConfirmationNumber();
			if (!prev && taken.has(conf)) conf = generateConfirmationNumber();
			taken.add(conf);
			return {
				id: rowId,
				dropzoneId: dz.id,
				confirmationNumber: conf,
				status: x.status ?? 'booked',
				name: x.name,
				email: x.email ?? null,
				phone: x.phone ?? null,
				idNumber: x.idNumber ?? null,
				gender: x.gender ?? null,
				dob: x.dob ?? null,
				nationality: x.nationality ?? null,
				heightCm: x.heightCm ?? null,
				weightKg: x.weightKg ?? null,
				addressLine1: x.addressLine1 ?? null,
				addressLine2: x.addressLine2 ?? null,
				city: x.city ?? null,
				postalCode: x.postalCode ?? null,
				country: x.country ?? null,
				guardianName: x.guardianName ?? null,
				guardianEmail: x.guardianEmail ?? null,
				guardianIdNumber: x.guardianIdNumber ?? null,
				emergencyName: x.emergencyName ?? null,
				emergencyEmail: x.emergencyEmail ?? null,
				emergencyPhone: x.emergencyPhone ?? null,
				jumpDate: x.jumpDate ?? null,
				bookingTime: x.bookingTime ?? null,
				extras: x.extras ?? [],
				heardFrom: x.heardFrom ?? null,
				note: x.note ?? null,
				indemnitySignedAt: x.indemnitySignedAt ? new Date(x.indemnitySignedAt) : null,
				currency: dz.currency,
				totalMinor: x.totalMinor ?? 0,
				depositMinor: x.depositMinor ?? 0,
				amountPaidMinor: x.amountPaidMinor ?? 0,
				paymentStatus: x.paymentStatus ?? 'unpaid',
				paymentMethod: x.paymentMethod ?? null,
				onlineBooking: x.onlineBooking ?? false,
				manifested: x.manifested ?? false,
				createdAt: x.createdAt ? new Date(x.createdAt) : new Date(now),
				sourceRef: x.ref
			};
		});
		await runChunked(
			db,
			upsertStatements(db, tandemPassengers, rows, tandemPassengers.id, [
				'status',
				'name',
				'email',
				'phone',
				'idNumber',
				'gender',
				'dob',
				'nationality',
				'heightCm',
				'weightKg',
				'addressLine1',
				'addressLine2',
				'city',
				'postalCode',
				'country',
				'guardianName',
				'guardianEmail',
				'guardianIdNumber',
				'emergencyName',
				'emergencyEmail',
				'emergencyPhone',
				'jumpDate',
				'bookingTime',
				'extras',
				'heardFrom',
				'note',
				'indemnitySignedAt',
				'totalMinor',
				'depositMinor',
				'amountPaidMinor',
				'paymentStatus',
				'paymentMethod',
				'onlineBooking',
				'manifested'
			])
		);
		t.add('tandems', rows.length);
	}

	// Waiver sections
	if (src.indemnitySections?.length) {
		const rows = src.indemnitySections.map((s, i) => ({
			id: id(s.ref),
			dropzoneId: dz.id,
			audience: s.audience,
			type: 'text' as const,
			position: s.position ?? i,
			title: s.title,
			content: s.content,
			createdAt: new Date(now),
			updatedAt: new Date(now)
		}));
		await runChunked(db, upsertStatements(db, sectionsT, rows, sectionsT.id, ['audience', 'position', 'title', 'content', 'updatedAt']));
		t.add('indemnitySections', rows.length);
	}

	// Loads + slots (history: written directly, no wallet side effects)
	if (src.loads?.length) {
		const existing = await db
			.select({ id: loadsT.id, day: loadsT.day, n: loadsT.loadNumber })
			.from(loadsT)
			.where(eq(loadsT.dropzoneId, dz.id));
		const occupied = new Map(existing.map((l) => [`${l.day}#${l.n}`, l.id]));
		const loadRows: (typeof loadsT.$inferInsert)[] = [];
		const slotRows: (typeof slotsT.$inferInsert)[] = [];
		const members = new Set<string>();
		for (const l of src.loads) {
			const loadId = id(l.ref);
			const holder = occupied.get(`${l.day}#${l.loadNumber}`);
			if (holder && holder !== loadId) {
				t.add('skipped');
				t.warn(`Load ${l.loadNumber} on ${l.day} already exists here; the imported one was skipped.`);
				continue;
			}
			const at = l.scheduledAt ? new Date(l.scheduledAt) : null;
			loadRows.push({
				id: loadId,
				dropzoneId: dz.id,
				day: l.day,
				loadNumber: l.loadNumber,
				status: l.status,
				isOpen: l.isOpen ?? false,
				aircraftId: l.aircraftName ? (aircraftIdByName.get(l.aircraftName.toLowerCase()) ?? null) : null,
				aircraftName: l.aircraftName ?? null,
				capacity: Math.max(l.capacity, l.slots.length),
				weightLimitKg: l.weightLimitKg ?? null,
				pilotName: l.pilotName ?? null,
				pilotWeightKg: l.pilotWeightKg ?? null,
				requirements: l.requirements ?? null,
				scheduledAt: at,
				completedAt: l.status === 'completed' ? (at ?? new Date(`${l.day}T12:00:00Z`)) : null,
				cancelledAt: l.status === 'cancelled' ? (at ?? new Date(`${l.day}T12:00:00Z`)) : null,
				refuel: l.refuel ?? false,
				shutdownMinutes: l.shutdownMinutes ?? null,
				createdBy: ctx.userId,
				createdAt: new Date(now),
				updatedAt: new Date(now)
			});
			l.slots.forEach((s, i) => {
				const userId = uid(s.person);
				if (userId) members.add(userId);
				slotRows.push({
					id: id(s.ref),
					dropzoneId: dz.id,
					loadId,
					userId,
					displayName: s.displayName,
					email: s.email ?? null,
					licence: s.licence ?? null,
					weightKg: s.weightKg ?? 0,
					jumpType: s.jumpType,
					groupId: s.groupId ? id(s.groupId) : null,
					teamId: s.teamName ? (teamIdByName.get(s.teamName.toLowerCase()) ?? null) : null,
					teamName: s.teamName ?? null,
					tandemPassengerId: s.tandem ? (tandemIdByRef.get(s.tandem) ?? null) : null,
					staffRole: s.staffRole ?? null,
					isLoadMaster: s.isLoadMaster ?? false,
					extras: s.extras ?? [],
					priceBreakdown: s.priceLines ?? [],
					depositMinor: s.depositMinor ?? 0,
					totalMinor: s.totalMinor ?? 0,
					currency: dz.currency,
					paid: s.paid ?? false,
					paidVia: s.paid ? 'manual' : null,
					staffPayMinor: s.staffPayMinor ?? 0,
					colour: s.colour ?? null,
					position: s.position ?? i,
					createdBy: ctx.userId,
					createdAt: new Date(now),
					updatedAt: new Date(now)
				});
			});
		}
		for (const m of members) await ensureMember(db, dz.id, m);
		await runChunked(
			db,
			upsertStatements(db, loadsT, loadRows, loadsT.id, [
				'status',
				'isOpen',
				'aircraftId',
				'aircraftName',
				'capacity',
				'weightLimitKg',
				'pilotName',
				'pilotWeightKg',
				'requirements',
				'scheduledAt',
				'completedAt',
				'cancelledAt',
				'refuel',
				'shutdownMinutes',
				'updatedAt'
			])
		);
		await runChunked(
			db,
			upsertStatements(db, slotsT, slotRows, slotsT.id, [
				'userId',
				'displayName',
				'email',
				'licence',
				'weightKg',
				'jumpType',
				'groupId',
				'teamId',
				'teamName',
				'tandemPassengerId',
				'staffRole',
				'isLoadMaster',
				'extras',
				'priceBreakdown',
				'depositMinor',
				'totalMinor',
				'paid',
				'paidVia',
				'staffPayMinor',
				'colour',
				'position',
				'updatedAt'
			])
		);
		t.add('loads', loadRows.length);
		t.add('slots', slotRows.length);
	}

	// Wallet opening balances (owner-authorised; idempotent per source wallet)
	for (const w of src.wallets ?? []) {
		const userId = uid(w.person);
		if (!userId) {
			t.add('skipped');
			continue;
		}
		if (w.dropzoneRef && w.dropzoneRef !== src.ref) {
			t.add('skipped');
			continue;
		}
		if (w.currency !== dz.currency) {
			t.add('skipped');
			t.warn(`A ${w.currency} wallet was skipped because this dropzone uses ${dz.currency}.`);
			continue;
		}
		await ensureMember(db, dz.id, userId);
		const txId = `import:${w.ref}`;
		const reason = 'Opening balance (imported)';
		if (w.availableMinor > 0) {
			await topUp(db, { userId, dropzoneId: dz.id, amountMinor: w.availableMinor, provider: 'manual', providerTxId: txId, reason, createdBy: ctx.userId, now });
		} else if (w.availableMinor < 0) {
			const account = await getOrCreateAccount(db, userId, dz.id);
			const dup = await db
				.select({ id: ledgerEntries.id })
				.from(ledgerEntries)
				.where(and(eq(ledgerEntries.accountId, account.id), eq(ledgerEntries.reason, `${reason} ${w.ref}`)))
				.limit(1);
			if (!dup[0]) await adjust(db, { userId, dropzoneId: dz.id, amountMinor: w.availableMinor, reason: `${reason} ${w.ref}`, createdBy: ctx.userId, now });
		}
		t.add('wallets');
	}
}

/** Counts of a bundle plus how much of it already exists here (for the preview step). */
export async function previewBundle(db: Database, b: Bundle, ctx: { userId: string; mode: ImportMode; dropzoneId?: string | null }) {
	const counts = countBundle(b);
	const warnings: string[] = [];
	let alreadyImported = 0;
	let newPeople = 0;
	if (ctx.mode === 'jumper') {
		if (!b.jumper) warnings.push('This file has no personal logbook data.');
		const refs = (b.jumper?.jumps ?? []).map((j) => j.ref);
		alreadyImported = (
			await selectIn(refs, (c) =>
				db
					.select({ id: logbookJumps.id })
					.from(logbookJumps)
					.where(and(eq(logbookJumps.userId, ctx.userId), eq(logbookJumps.source, 'import'), inArray(logbookJumps.sourceRef, c)))
			)
		).length;
		if (b.jumper?.wallets?.length) warnings.push('Wallet balances are not taken from a personal import.');
	} else {
		if (!b.dropzone) warnings.push('This file has no dropzone data.');
		const refs = b.people.map((p) => p.ref);
		const emails = b.people.map((p) => p.email).filter((e): e is string => !!e);
		const known = new Set<string>();
		for (const u of await selectIn(refs, (c) => db.select({ r: users.sourceRef }).from(users).where(inArray(users.sourceRef, c)))) known.add(u.r!);
		const knownEmails = new Set(
			(await selectIn(emails, (c) => db.select({ e: users.email }).from(users).where(inArray(users.email, c)))).map((u) => u.e)
		);
		newPeople = b.people.filter((p) => !known.has(p.ref) && !(p.email && knownEmails.has(p.email))).length;
		if (ctx.dropzoneId && b.dropzone) {
			const dz = (await db.select().from(dropzones).where(eq(dropzones.id, ctx.dropzoneId)).limit(1))[0];
			if (dz && b.dropzone.currency && b.dropzone.currency !== dz.currency) {
				warnings.push(`Source currency ${b.dropzone.currency} differs from this dropzone's ${dz.currency}.`);
			}
		}
	}
	const samples = {
		jumps: (b.jumper?.jumps ?? []).slice(0, 5).map((j) => ({
			jumpNumber: j.jumpNumber ?? null,
			jumpDate: j.jumpDate,
			location: j.location ?? null,
			aircraft: j.aircraft ?? null,
			jumpType: j.jumpType ?? null,
			altitudeFt: j.altitudeFt ?? null
		})),
		loads: (b.dropzone?.loads ?? []).slice(-5).map((l) => ({
			day: l.day,
			loadNumber: l.loadNumber,
			status: l.status,
			aircraftName: l.aircraftName ?? null,
			slots: l.slots.length
		})),
		people: b.people.slice(0, 5).map((p) => ({ name: p.name, email: p.email ?? null, licence: p.licence ?? null }))
	};
	return { counts, alreadyImported, newPeople, samples, warnings, source: b.source.system, mode: ctx.mode };
}

export type ImportPreview = Awaited<ReturnType<typeof previewBundle>>;
