import { describe, expect, test } from 'bun:test';
import { csvMoney, toCsv } from './csv.ts';
import { decryptSecret, encryptSecret, maskSecret } from './secrets.ts';

describe('csv', () => {
	test('quotes, escapes and guards formulas', () => {
		const csv = toCsv(
			[
				{ a: 'plain', b: 1 },
				{ a: 'has, comma', b: -2 },
				{ a: 'say "hi"\nthere', b: null },
				{ a: '=SUM(A1)', b: 0 }
			],
			[
				{ label: 'A', value: (r) => r.a },
				{ label: 'B', value: (r) => r.b }
			]
		);
		expect(csv).toBe('A,B\r\nplain,1\r\n"has, comma",-2\r\n"say ""hi""\nthere",\r\n\'=SUM(A1),0\r\n');
		expect(csvMoney(12345)).toBe('123.45');
	});
});

describe('secrets', () => {
	test('encrypt/decrypt round trip, wrong key fails, mask keeps last 4', async () => {
		const enc = await encryptSecret('merchant-key-1234', 'k1');
		expect(enc.startsWith('v1:')).toBe(true);
		expect(enc).not.toContain('merchant');
		expect(await decryptSecret(enc, 'k1')).toBe('merchant-key-1234');
		expect(await decryptSecret(enc, 'k2')).toBeNull();
		expect(await decryptSecret('garbage', 'k1')).toBeNull();
		expect(maskSecret('merchant-key-1234')).toBe('••••••••••••1234');
		expect(maskSecret('abc')).toBe('••••');
		expect(maskSecret(null)).toBeNull();
	});
});
