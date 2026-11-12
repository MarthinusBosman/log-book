/** Client-safe view models for the manifest board, load detail and hangar display. */
import type { JumpType, LoadStatus, SlotExtra, SlotStaffRole } from '../../domain/constants.ts';

export type PriceLine = { code: string; label: string; amountMinor: number };

export type SlotVM = {
	id: string;
	userId: string | null;
	displayName: string;
	/** Profile picture URL (account holders with a photo). */
	avatar: string | null;
	licence: string | null;
	weightKg: number;
	jumpType: JumpType;
	staffRole: SlotStaffRole | null;
	isLoadMaster: boolean;
	extras: SlotExtra[];
	groupId: string | null;
	teamName: string | null;
	tandemPassengerId: string | null;
	colour: string | null;
	/** TI role colour (tandem instructors are colour coded). */
	tiColour: string | null;
	note: string | null;
	totalMinor: number;
	depositMinor: number;
	baseOverrideMinor: number | null;
	priceBreakdown: PriceLine[];
	paid: boolean;
	paidVia: string | null;
	held: boolean;
	/** e.g. "PASA expired" when the jumper's association membership ended before the load day. */
	membershipWarning?: string | null;
};

export type LoadStatsVM = {
	used: number;
	free: number;
	weightKg: number;
	weightLimitKg: number | null;
	full: boolean;
	overweight: boolean;
};

export type LoadVM = {
	id: string;
	day: string;
	loadNumber: number;
	status: LoadStatus;
	isOpen: boolean;
	aircraftId: string | null;
	aircraftName: string | null;
	capacity: number;
	weightLimitKg: number | null;
	pilotUserId: string | null;
	pilotName: string | null;
	pilotWeightKg: number | null;
	requirements: string | null;
	scheduledAt: number | null;
	callStartedAt: number | null;
	callDueAt: number | null;
	completedAt: number | null;
	refuel: boolean;
	shutdownMinutes: number | null;
	stats: LoadStatsVM;
	slots: SlotVM[];
};

/** Hangar display: no money, no ids beyond what the board needs. */
export type DisplaySlotVM = Pick<SlotVM, 'id' | 'displayName' | 'jumpType' | 'staffRole' | 'isLoadMaster' | 'groupId' | 'teamName' | 'colour' | 'tiColour' | 'extras' | 'tandemPassengerId'>;
export type DisplayLoadVM = Omit<LoadVM, 'slots' | 'pilotUserId' | 'aircraftId' | 'pilotWeightKg' | 'requirements'> & {
	requirements: string | null;
	slots: DisplaySlotVM[];
};

export type CompleteSummary = {
	loadNumber: number;
	logbookEntries: number;
	charged: number;
	notified: number;
	staffPaid: number;
};

/** Staff part of the /app dashboard. */
export type StaffTodayVM = {
	day: string;
	loadsFlown: number;
	loadsPlanned: number;
	checkedIn: number;
	slotsSold: number;
	tandems: number;
	tandemsDone: number;
	nextLoad: LoadVM | null;
};
