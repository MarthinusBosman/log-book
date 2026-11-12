import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, users, type Rig } from '../db/schema.ts';
import { aadStatus, repackIntervalDays, repackStatus, wingLoading, type RigInput } from '../domain/gear.ts';
import { DomainError } from '../domain/errors.ts';
import { int, num, opt, todayAt } from './forms.ts';

/** Repack interval, warn window, today and exit weight for a jumper's gear pages. */
export async function gearContext(db: Database, userId: string, dropzoneId: string | null | undefined) {
	const [dz, u, today] = await Promise.all([
		dropzoneId
			? db.select({ days: dropzones.repackIntervalDays, country: dropzones.country, settings: dropzones.settings, name: dropzones.name }).from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1)
			: Promise.resolve([]),
		db.select({ w: users.loadingWeightKg, w2: users.weightKg }).from(users).where(eq(users.id, userId)).limit(1),
		todayAt(db, dropzoneId)
	]);
	const d = dz[0];
	return {
		today,
		intervalDays: repackIntervalDays({ dropzoneDays: d?.days, country: d?.country }),
		intervalSource: d ? d.name : null,
		warnDays: d?.settings.gearWarnDays ?? 30,
		exitWeightKg: u[0]?.w ?? u[0]?.w2 ?? null
	};
}
export type GearContext = Awaited<ReturnType<typeof gearContext>>;

export function rigView(rig: Rig, ctx: GearContext) {
	const repack = repackStatus(rig, { today: ctx.today, intervalDays: ctx.intervalDays, warnDays: ctx.warnDays });
	const aad = aadStatus(rig, { today: ctx.today, warnDays: ctx.warnDays });
	return {
		id: rig.id,
		name: rig.name,
		title: rig.name || rig.container || 'My rig',
		container: rig.container,
		mainCanopy: rig.mainCanopy,
		mainSizeSqft: rig.mainSizeSqft,
		wingLoading: wingLoading(ctx.exitWeightKg, rig.mainSizeSqft) ?? rig.wingLoading,
		reserveCanopy: rig.reserveCanopy,
		reserveSizeSqft: rig.reserveSizeSqft,
		reserveRepackedOn: rig.reserveRepackedOn,
		repackIntervalDays: rig.repackIntervalDays,
		aad: rig.aad,
		aadSerial: rig.aadSerial,
		aadServiceDueOn: rig.aadServiceDueOn,
		aadExpiresOn: rig.aadExpiresOn,
		wingsuit: rig.wingsuit,
		notes: rig.notes,
		active: rig.active,
		repack,
		aadDue: aad
	};
}
export type RigView = ReturnType<typeof rigView>;

const size = (form: FormData, key: string, label: string) => {
	const v = num(form, key);
	if (v === null) return null;
	if (!Number.isFinite(v) || v < 20 || v > 500) throw new DomainError('invalid', `${label} size must be in sq ft (20–500)`);
	return Math.round(v);
};

export function parseRigForm(form: FormData, exitWeightKg: number | null): RigInput {
	const container = opt(form, 'container');
	if (!container) throw new DomainError('invalid', 'Container make is required');
	if (!opt(form, 'mainCanopy')) throw new DomainError('invalid', 'Main canopy is required');
	if (!opt(form, 'reserveCanopy')) throw new DomainError('invalid', 'Reserve canopy is required');
	const main = size(form, 'mainSizeSqft', 'Main');
	const interval = int(form, 'repackIntervalDays');
	if (interval !== null && (!Number.isFinite(interval) || interval < 30 || interval > 400)) throw new DomainError('invalid', 'Repack interval must be 30–400 days');
	const repacked = opt(form, 'reserveRepackedOn');
	if (!repacked) throw new DomainError('invalid', 'Please set the reserve repack date');
	return {
		kind: 'personal',
		name: opt(form, 'name'),
		container,
		mainCanopy: opt(form, 'mainCanopy'),
		mainSizeSqft: main,
		wingLoading: wingLoading(exitWeightKg, main),
		reserveCanopy: opt(form, 'reserveCanopy'),
		reserveSizeSqft: size(form, 'reserveSizeSqft', 'Reserve'),
		reserveRepackedOn: repacked,
		repackIntervalDays: interval,
		aad: opt(form, 'aad'),
		aadSerial: opt(form, 'aadSerial'),
		aadServiceDueOn: opt(form, 'aadServiceDueOn'),
		aadExpiresOn: opt(form, 'aadExpiresOn'),
		wingsuit: opt(form, 'wingsuit'),
		notes: opt(form, 'notes')
	};
}
