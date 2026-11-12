/** Report data + CSV builders for /app/reports (shared by the page, CSV export and print views). */
import type { Database } from '#lib/server/db/index.ts';
import { jumpReport } from '#lib/server/domain/reports.ts';
import { revenueByItem, tandemSummary, walletFlows } from '#lib/server/domain/staff-admin.ts';
import { csvMoney, toCsv } from './csv.ts';

export async function reportData(db: Database, dropzoneId: string, from: string, to: string) {
	const [jumps, revenue, tandems, wallet] = await Promise.all([
		jumpReport(db, dropzoneId, from, to),
		revenueByItem(db, dropzoneId, from, to),
		tandemSummary(db, dropzoneId, from, to),
		walletFlows(db, dropzoneId, from, to)
	]);
	return { jumps, revenue, tandems, wallet };
}

export type ReportData = Awaited<ReturnType<typeof reportData>>;

export const CSV_KINDS = ['summary', 'daily', 'aircraft', 'staff', 'revenue', 'tandems', 'wallet'] as const;
export type CsvKind = (typeof CSV_KINDS)[number];

/** Jump report rows exactly as the original's PDF (Item / Count, with indented sub-rows). */
export function summaryRows(t: ReportData['jumps']['totals']): { item: string; count: number; sub: boolean }[] {
	return [
		{ item: 'Total Loads', count: t.loads, sub: false },
		{ item: 'Total Slots', count: t.slots, sub: false },
		{ item: 'Extra Altitude', count: t.extraAltitude, sub: true },
		{ item: 'Max Altitude', count: t.maxAltitude, sub: true },
		{ item: 'Beach Landing', count: t.beachLanding, sub: true },
		{ item: 'Total Tandems', count: t.tandems, sub: false },
		{ item: 'Hand Cam', count: t.handcam, sub: true },
		{ item: 'Outside Cam', count: t.outsideVideo, sub: true },
		{ item: 'Extreme Ride', count: t.extremeRide, sub: true },
		{ item: 'Sporties', count: t.sporties, sub: false },
		{ item: 'AFF', count: t.aff, sub: true },
		{ item: 'Static Line', count: t.staticLine, sub: true },
		{ item: 'Gear Rental', count: t.gearRental, sub: true },
		{ item: 'Coach Jumps', count: t.coachJumps, sub: true }
	];
}

export function reportCsv(kind: CsvKind, d: ReportData, currency: string): string {
	const c = `(${currency})`;
	switch (kind) {
		case 'summary':
			return toCsv(summaryRows(d.jumps.totals), [
				{ label: 'Item', value: (r) => (r.sub ? `  ${r.item}` : r.item) },
				{ label: 'Count', value: (r) => r.count }
			]);
		case 'daily':
			return toCsv(d.jumps.perDay, [
				{ label: 'Day', value: (r) => r.day },
				{ label: 'Loads', value: (r) => r.loads },
				{ label: 'Slots', value: (r) => r.slots },
				{ label: `Slot value ${c}`, value: (r) => csvMoney(r.revenueMinor) }
			]);
		case 'aircraft':
			return toCsv(d.jumps.perAircraft, [
				{ label: 'Aircraft', value: (r) => r.aircraft },
				{ label: 'Loads', value: (r) => r.loads },
				{ label: 'Slots', value: (r) => r.slots }
			]);
		case 'staff':
			return toCsv(d.jumps.perStaff, [
				{ label: 'Staff member', value: (r) => r.name },
				{ label: 'Staff slots', value: (r) => r.slots },
				{ label: `Pay ${c}`, value: (r) => csvMoney(r.payMinor) }
			]);
		case 'revenue':
			return toCsv(d.revenue.items, [
				{ label: 'Code', value: (r) => r.code },
				{ label: 'Item', value: (r) => r.label },
				{ label: 'Count', value: (r) => r.count },
				{ label: `Amount ${c}`, value: (r) => csvMoney(r.amountMinor) }
			]);
		case 'tandems':
			return toCsv(d.tandems.passengers, [
				{ label: 'Jump date', value: (r) => r.jumpDate },
				{ label: 'Time', value: (r) => r.bookingTime },
				{ label: 'Name', value: (r) => r.name },
				{ label: 'Confirmation', value: (r) => r.confirmationNumber },
				{ label: 'Status', value: (r) => r.status },
				{ label: 'Payment', value: (r) => r.paymentStatus },
				{ label: 'Extras', value: (r) => (r.extras ?? []).join(' ') },
				{ label: 'Online', value: (r) => (r.onlineBooking ? 'yes' : 'no') },
				{ label: `Total ${c}`, value: (r) => csvMoney(r.totalMinor) },
				{ label: `Paid ${c}`, value: (r) => csvMoney(r.amountPaidMinor) }
			]);
		case 'wallet':
			return toCsv(d.wallet.days, [
				{ label: 'Day', value: (r) => r.day },
				{ label: `Top-ups ${c}`, value: (r) => csvMoney(r.topupMinor) },
				{ label: `Jump charges ${c}`, value: (r) => csvMoney(r.chargeMinor) },
				{ label: `Refunds ${c}`, value: (r) => csvMoney(r.refundMinor) },
				{ label: `Adjustments ${c}`, value: (r) => csvMoney(r.adjustmentMinor) },
				{ label: `Staff pay ${c}`, value: (r) => csvMoney(r.staffPayMinor) }
			]);
	}
}
