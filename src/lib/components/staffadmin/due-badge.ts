import type { DueStatus } from '#lib/domain/constants.ts';

export type DueBadgeInput = {
	status: DueStatus;
	dueOn: string | null;
	daysLeft: number | null;
	/** AAD only: which date drives the status (end of life can't be fixed by a service). */
	cause?: 'service' | 'end_of_life' | null;
};

/** Pure: badge text + optional sub line for the staff gear tables (DZ rigs + Members' gear). */
export function dueBadgeText(d: DueBadgeInput, empty = 'Not set'): { text: string; sub: string | null } {
	if (d.daysLeft == null) return { text: empty, sub: null };
	const eol = d.cause === 'end_of_life';
	const text =
		d.daysLeft < 0
			? eol
				? 'Past end of life'
				: `${-d.daysLeft}d overdue`
			: d.daysLeft === 0
				? eol
					? 'Ends today'
					: 'Due today'
				: d.status === 'due_soon'
					? `${d.daysLeft}d left`
					: (d.dueOn ?? '');
	if (eol) return { text, sub: d.status === 'ok' ? 'End of life' : `End of life ${d.dueOn}` };
	return { text, sub: d.dueOn && d.status !== 'ok' ? d.dueOn : null };
}
