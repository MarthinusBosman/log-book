/** Server-side view-model builders for the manifest board, detail, display and staff dashboard. */
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { slots as slotsTable, tandemPassengers, type Dropzone } from '../db/schema.ts';
import { listLoadsForDay, type LoadWithSlots } from '../domain/loads.ts';
import { listUsersWithRole } from '../domain/permissions.ts';
import { listCheckedIn } from '../domain/checkins.ts';
import { localDate } from '../domain/time.ts';
import { avatarMap } from '../avatars.ts';
import { flagMembershipWarnings } from '../memberships/service.ts';
import type { JumpType } from '../../domain/constants.ts';
import type { DisplayLoadVM, LoadVM, SlotVM, StaffTodayVM } from '../../components/manifest/types.ts';
import { ACTIVE_STATUSES } from '../../components/manifest/manifest.ts';

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

/** TI colour per user (from the tandem_instructor role) so TI slots are colour coded. */
export async function tiColours(db: Database, dropzoneId: string): Promise<Record<string, string>> {
	const tis = await listUsersWithRole(db, dropzoneId, 'tandem_instructor');
	return Object.fromEntries(tis.filter((t) => t.colour).map((t) => [t.id, t.colour as string]));
}

export function toLoadVM(l: LoadWithSlots, colours: Record<string, string> = {}, avatars: Record<string, string> = {}): LoadVM {
	return {
		id: l.id,
		day: l.day,
		loadNumber: l.loadNumber,
		status: l.status,
		isOpen: l.isOpen,
		aircraftId: l.aircraftId,
		aircraftName: l.aircraftName,
		capacity: l.capacity,
		weightLimitKg: l.weightLimitKg,
		pilotUserId: l.pilotUserId,
		pilotName: l.pilotName,
		pilotWeightKg: l.pilotWeightKg,
		requirements: l.requirements,
		scheduledAt: ms(l.scheduledAt),
		callStartedAt: ms(l.callStartedAt),
		callDueAt: ms(l.callDueAt),
		completedAt: ms(l.completedAt),
		refuel: l.refuel,
		shutdownMinutes: l.shutdownMinutes,
		stats: l.stats,
		slots: l.slots.map(
			(s): SlotVM => ({
				id: s.id,
				userId: s.userId,
				displayName: s.displayName,
				avatar: s.userId ? (avatars[s.userId] ?? null) : null,
				licence: s.licence,
				weightKg: s.weightKg,
				jumpType: s.jumpType as JumpType,
				staffRole: s.staffRole,
				isLoadMaster: s.isLoadMaster,
				extras: s.extras,
				groupId: s.groupId,
				teamName: s.teamName,
				tandemPassengerId: s.tandemPassengerId,
				colour: s.colour,
				tiColour: s.staffRole === 'tandem_instructor' && s.userId ? (colours[s.userId] ?? null) : null,
				note: s.note,
				totalMinor: s.totalMinor,
				depositMinor: s.depositMinor,
				baseOverrideMinor: s.baseOverrideMinor,
				priceBreakdown: s.priceBreakdown,
				paid: s.paid,
				paidVia: s.paidVia,
				held: !!s.walletHoldId
			})
		)
	};
}

export async function boardLoads(db: Database, dz: Dropzone, day: string, opts: { includeCancelled?: boolean } = {}): Promise<LoadVM[]> {
	const [list, colours] = await Promise.all([
		listLoadsForDay(db, dz.id, day, { includeCancelled: opts.includeCancelled ?? true }),
		tiColours(db, dz.id)
	]);
	const avatars = await avatarMap(db, list.flatMap((l) => l.slots.map((s) => s.userId)));
	return flagMembershipWarnings(db, list.map((l) => toLoadVM(l, colours, avatars)));
}

/** Hangar display: loads that haven't finished yet (planned → departed), no money. */
export async function displayLoads(db: Database, dz: Dropzone, day: string): Promise<DisplayLoadVM[]> {
	const all = await boardLoads(db, dz, day, { includeCancelled: false });
	return all
		.filter((l) => [...ACTIVE_STATUSES, 'departed'].includes(l.status))
		.map((l) => ({
			id: l.id,
			day: l.day,
			loadNumber: l.loadNumber,
			status: l.status,
			isOpen: l.isOpen,
			aircraftName: l.aircraftName,
			capacity: l.capacity,
			weightLimitKg: l.weightLimitKg,
			pilotName: l.pilotName,
			requirements: l.requirements,
			scheduledAt: l.scheduledAt,
			callStartedAt: l.callStartedAt,
			callDueAt: l.callDueAt,
			completedAt: l.completedAt,
			refuel: l.refuel,
			shutdownMinutes: l.shutdownMinutes,
			stats: l.stats,
			slots: l.slots.map((s) => ({
				id: s.id,
				displayName: s.displayName,
				jumpType: s.jumpType,
				staffRole: s.staffRole,
				isLoadMaster: s.isLoadMaster,
				groupId: s.groupId,
				teamName: s.teamName,
				colour: s.colour,
				tiColour: s.tiColour,
				tandemPassengerId: s.tandemPassengerId,
				extras: s.extras
			}))
		}));
}


/** Staff dashboard numbers for "today" in the DZ timezone. */
export async function staffToday(db: Database, dz: Dropzone, now = Date.now()): Promise<StaffTodayVM> {
	const day = localDate(now, dz.timezone);
	const [list, checked, tandemRows] = await Promise.all([
		boardLoads(db, dz, day, { includeCancelled: false }),
		listCheckedIn(db, dz.id),
		db
			.select({ status: tandemPassengers.status })
			.from(tandemPassengers)
			.where(and(eq(tandemPassengers.dropzoneId, dz.id), eq(tandemPassengers.jumpDate, day), ne(tandemPassengers.status, 'cancelled')))
	]);
	const loadIds = list.map((l) => l.id);
	const sold = loadIds.length
		? (await db.select({ id: slotsTable.id, staffRole: slotsTable.staffRole }).from(slotsTable).where(inArray(slotsTable.loadId, loadIds))).filter(
				(s) => !s.staffRole
			).length
		: 0;
	return {
		day,
		loadsFlown: list.filter((l) => l.status === 'completed').length,
		loadsPlanned: list.length,
		checkedIn: checked.length,
		slotsSold: sold,
		tandems: tandemRows.length,
		tandemsDone: tandemRows.filter((t) => t.status === 'completed').length,
		nextLoad: list.find((l) => ACTIVE_STATUSES.includes(l.status)) ?? null
	};
}
