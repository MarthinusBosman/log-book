/**
 * Group bookings on the public confirmation page. A booking for several jumpers creates one
 * passenger (and confirmation number) each; the lead's page lists the others from `?g=`.
 * These helpers load that group and work out what is still due across it, so the lead can
 * see the group total and pay for everyone online (e.g. after a cancelled group checkout).
 */
import type { Database } from '../db/index.ts';
import type { TandemPassenger } from '../db/schema.ts';
import { findByConfirmation } from '../domain/tandems.ts';

/** Most other jumpers one booking can hold (MAX_JUMPERS − the lead). */
export const MAX_GROUP_CODES = 4;

/** Parse the `g` list (comma separated confirmation numbers). */
export function groupCodes(raw: string | null | undefined): string[] {
	const seen = new Set<string>();
	for (const c of (raw ?? '').split(',')) {
		const code = c.trim().toUpperCase();
		if (code && !seen.has(code)) seen.add(code);
	}
	return [...seen].slice(0, MAX_GROUP_CODES);
}

/** The other jumpers of the lead's group: same dropzone + jump date, never the lead itself. */
export async function loadGroup(db: Database, lead: TandemPassenger, codes: string[]): Promise<TandemPassenger[]> {
	const out: TandemPassenger[] = [];
	for (const c of codes) {
		const g = await findByConfirmation(db, c);
		if (g && g.id !== lead.id && g.dropzoneId === lead.dropzoneId && g.jumpDate === lead.jumpDate && !out.some((o) => o.id === g.id)) out.push(g);
	}
	return out;
}

type Member = Pick<TandemPassenger, 'id' | 'status' | 'totalMinor' | 'amountPaidMinor'>;
export type Allocation = { passengerId: string; amountMinor: number };

/**
 * What can be paid online now for these passengers (cancelled and settled ones skipped).
 * A deposit is offered only when the summed deposit is less than the summed balance;
 * passengers who already paid something owe no deposit (same rule as a single booking).
 */
export function groupDue(members: Member[], depositEach: number) {
	const balance: Allocation[] = [];
	const deposit: Allocation[] = [];
	for (const m of members) {
		if (m.status === 'cancelled') continue;
		const owed = Math.max(0, m.totalMinor - m.amountPaidMinor);
		if (owed <= 0) continue;
		balance.push({ passengerId: m.id, amountMinor: owed });
		const dep = m.amountPaidMinor === 0 ? Math.min(owed, Math.max(0, depositEach)) : 0;
		if (dep > 0) deposit.push({ passengerId: m.id, amountMinor: dep });
	}
	const sum = (a: Allocation[]) => a.reduce((s, x) => s + x.amountMinor, 0);
	const balanceMinor = sum(balance);
	const depositMinor = sum(deposit);
	const offerDeposit = depositMinor > 0 && depositMinor < balanceMinor;
	return {
		balanceMinor,
		depositMinor: offerDeposit ? depositMinor : 0,
		allocations: { balance, deposit: offerDeposit ? deposit : [] }
	};
}
