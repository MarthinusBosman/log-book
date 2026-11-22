import { describe, expect, test } from 'bun:test';
import { staffWork } from './staff-work.ts';

describe('staffWork', () => {
	test('jumps, loads flown, both, neither', () => {
		expect(staffWork({ slots: 3, loads: 0 })).toBe('3 jumps');
		expect(staffWork({ slots: 1, loads: 0 })).toBe('1 jump');
		expect(staffWork({ slots: 0, loads: 2 })).toBe('2 loads flown');
		expect(staffWork({ slots: 1, loads: 1 })).toBe('1 jump · 1 load flown');
		expect(staffWork({ slots: 0, loads: 0 })).toBe('—');
	});
});
