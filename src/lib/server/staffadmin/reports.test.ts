import { describe, expect, test } from 'bun:test';
import { reportCsv, type ReportData } from './reports.ts';

describe('reportCsv staff', () => {
	test('pilots get a Loads flown count instead of looking like zero-jump staff', () => {
		const d = {
			jumps: {
				perStaff: [
					{ userId: null, name: 'Pat', slots: 0, loads: 3, payMinor: 150000 },
					{ userId: 'u1', name: 'Tia', slots: 2, loads: 0, payMinor: 80000 }
				]
			}
		} as unknown as ReportData;
		const lines = reportCsv('staff', d, 'ZAR').trim().split(/\r?\n/);
		expect(lines[0]).toBe('Staff member,Staff slots,Loads flown,Pay (ZAR)');
		expect(lines[1]).toBe('Pat,0,3,1500.00');
		expect(lines[2]).toBe('Tia,2,0,800.00');
	});
});
