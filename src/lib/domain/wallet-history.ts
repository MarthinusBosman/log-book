/**
 * Jumper-facing wallet history (client-safe).
 *
 * The ledger records every reservation step: manifesting writes a `hold`, landing writes a
 * `hold_release` + `charge`, leaving a load writes a `hold_release`. Shown raw that is three
 * rows per jump ("Jump reserved / Reservation cancelled / Jump charged") and a balance column
 * that jumps up and down. Jumpers only care about money in and out, so this view:
 *
 * - drops `hold_release` rows and every `hold` that was released (net zero);
 * - keeps a hold that is still open as a neutral "reserved" row (it explains why Available is
 *   lower than the balance);
 * - shows the balance as available + reserved, which holds don't change, so every signed row
 *   moves the balance by exactly its amount.
 *
 * Staff views keep the raw ledger.
 */
import { LEDGER_TYPE_LABELS, type LedgerType } from './constants.ts';

export type LedgerRow = {
	id: string;
	type: string;
	amountMinor: number;
	availableAfterMinor: number;
	pendingAfterMinor: number;
	relatedEntryId: string | null;
	reason: string | null;
	loadNumber?: number | null;
	loadDay?: string | null;
	createdAt: number;
};

export type HistoryRow = {
	id: string;
	/** 'in' credits, 'out' debits, 'reserved' an open hold (no balance change). */
	direction: 'in' | 'out' | 'reserved';
	title: string;
	detail: string | null;
	amountMinor: number;
	balanceAfterMinor: number;
	loadNumber: number | null;
	loadDay: string | null;
	createdAt: number;
};

const CREDITS: LedgerType[] = ['topup', 'refund', 'staff_pay'];

/** Rows newest first, as `listLedger` returns them. */
export function walletHistory(rows: LedgerRow[]): HistoryRow[] {
	const released = new Set(rows.filter((r) => r.type === 'hold_release' && r.relatedEntryId).map((r) => r.relatedEntryId as string));
	const out: HistoryRow[] = [];
	for (const r of rows) {
		if (r.type === 'hold_release') continue;
		if (r.type === 'hold' && released.has(r.id)) continue;
		const label = LEDGER_TYPE_LABELS[r.type as LedgerType] ?? r.type;
		const direction: HistoryRow['direction'] =
			r.type === 'hold' ? 'reserved' : r.type === 'adjustment' ? (r.amountMinor >= 0 ? 'in' : 'out') : CREDITS.includes(r.type as LedgerType) ? 'in' : 'out';
		out.push({
			id: r.id,
			direction,
			title: r.type === 'hold' ? 'Reserved for a jump' : label,
			detail: r.reason && r.reason !== label ? r.reason : null,
			amountMinor: Math.abs(r.amountMinor),
			balanceAfterMinor: r.availableAfterMinor + r.pendingAfterMinor,
			loadNumber: r.loadNumber ?? null,
			loadDay: r.loadDay ?? null,
			createdAt: r.createdAt
		});
	}
	return out;
}
