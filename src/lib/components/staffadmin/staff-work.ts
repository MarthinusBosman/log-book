/** "3 jumps · 2 loads flown" for a per-staff report row (pilots fly loads, they don't jump them). */
export function staffWork(s: { slots: number; loads: number }): string {
	const parts: string[] = [];
	if (s.slots) parts.push(`${s.slots} jump${s.slots === 1 ? '' : 's'}`);
	if (s.loads) parts.push(`${s.loads} load${s.loads === 1 ? '' : 's'} flown`);
	return parts.join(' · ') || '—';
}
