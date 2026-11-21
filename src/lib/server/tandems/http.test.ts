import { afterEach, describe, expect, test } from 'bun:test';
import { confirmationRecipient, confirmationUrl, moneyToMinor, sendConfirmationEmail } from './http.ts';
import { MANUAL_OPTION, payChoices } from './payments.ts';
import { setMailer, type EmailMessage } from '../email/index.ts';
import type { Dropzone, TandemPassenger } from '../db/schema.ts';

describe('moneyToMinor (staff tandem deposit / payment amounts)', () => {
	test('comma decimals are not read as thousands', () => {
		expect(moneyToMinor('450,50')).toBe(45050);
		expect(moneyToMinor('1 250.50')).toBe(125050);
		expect(moneyToMinor('R 3 400')).toBe(340000);
		expect(moneyToMinor('1,000')).toBe(100000);
	});
	test('blank is null, junk and negatives are NaN', () => {
		expect(moneyToMinor('')).toBeNull();
		expect(moneyToMinor('  ')).toBeNull();
		expect(moneyToMinor('-50')).toBeNaN();
		expect(moneyToMinor('abc')).toBeNaN();
	});
});

describe('booking confirmation email for a group', () => {
	const origin = 'https://dz.example';
	const dz = { slug: 'demo', name: 'Demo DZ', address: null, contactPhone: null } as unknown as Dropzone;
	const passenger = (name: string, confirmationNumber: string, email: string | null): TandemPassenger =>
		({
			name,
			email,
			confirmationNumber,
			jumpDate: '2026-11-21',
			bookingTime: '11:00',
			extras: [],
			totalMinor: 340000,
			amountPaidMinor: 0,
			currency: 'ZAR',
			indemnitySignedAt: null
		}) as unknown as TandemPassenger;
	const lead = passenger('Nadia Customer', 'AAAA-1111', 'nadia@example.com');
	const sam = passenger('Sam Customer', 'BBBB-2222', 'sam@example.com');
	const kim = passenger('Kim Customer', 'CCCC-3333', null);
	let sent: EmailMessage[] = [];
	afterEach(() => {
		setMailer(null);
		sent = [];
	});
	const capture = () => setMailer({ send: async (m) => void sent.push(m) });

	test('confirmationUrl adds ?g= only for a group', () => {
		expect(confirmationUrl(origin, dz, lead)).toBe('https://dz.example/dz/demo/book/AAAA-1111');
		expect(confirmationUrl(origin, dz, lead, [sam, kim])).toBe('https://dz.example/dz/demo/book/AAAA-1111?g=BBBB-2222,CCCC-3333');
	});

	test("the lead's email opens the group view and lists each jumper's sign link", async () => {
		capture();
		expect(await sendConfirmationEmail(dz, lead, origin, [sam, kim])).toBe(true);
		const text = sent[0].text ?? '';
		expect(text).toContain('download the confirmation PDF: https://dz.example/dz/demo/book/AAAA-1111?g=BBBB-2222,CCCC-3333\n');
		expect(text).toContain('indemnity before the jump: https://dz.example/dz/demo/book/AAAA-1111?g=BBBB-2222,CCCC-3333#indemnity');
		expect(text).toContain('- Sam Customer: https://dz.example/dz/demo/book/BBBB-2222#indemnity');
		// A jumper without an email still gets a link the lead can forward.
		expect(text).toContain('- Kim Customer: https://dz.example/dz/demo/book/CCCC-3333#indemnity');
	});

	test('a single booking (or a fellow jumper) gets the plain link and no group section', async () => {
		capture();
		await sendConfirmationEmail(dz, sam, origin);
		const text = sent[0].text ?? '';
		expect(text).toContain('https://dz.example/dz/demo/book/BBBB-2222\n');
		expect(text).not.toContain('?g=');
		expect(text).not.toContain('Your group');
	});

	test('an unpriced booking says the price is set at the dropzone instead of R 0,00', async () => {
		capture();
		await sendConfirmationEmail(dz, { ...sam, totalMinor: 0 }, origin);
		const text = sent[0].text ?? '';
		expect(text).toContain('Price: at the dropzone');
		expect(text).not.toContain('Total:');
		await sendConfirmationEmail(dz, sam, origin);
		expect(sent[1].text).toMatch(/Total: R\s?3\s?400,00 · Paid: R\s?0,00/);
	});

	test('a passenger without an email only goes to the guardian when asked (staff resend)', async () => {
		capture();
		const max = { ...kim, name: 'Max Customer', guardianName: 'Nadia Customer', guardianEmail: 'nadia@example.com' } as TandemPassenger;
		expect(confirmationRecipient(max)).toBeNull();
		expect(await sendConfirmationEmail(dz, max, origin)).toBe(false);
		expect(sent).toHaveLength(0);
		expect(confirmationRecipient(max, { guardian: true })).toEqual({ to: 'nadia@example.com', guardian: true });
		expect(await sendConfirmationEmail(dz, max, origin, [], { guardian: true })).toBe(true);
		expect(sent[0].to).toBe('nadia@example.com');
		expect(sent[0].subject).toBe('Max’s tandem skydive at Demo DZ — CCCC-3333');
		const text = sent[0].text ?? '';
		expect(text.startsWith('Hi Nadia,\n\nMax’s tandem skydive at Demo DZ is booked!')).toBe(true);
		expect(text).toContain('Please sign Max’s indemnity (as parent or guardian) before the jump: https://dz.example/dz/demo/book/CCCC-3333#indemnity');
		// Their own email always wins over the guardian's.
		expect(confirmationRecipient({ ...max, email: 'max@example.com' }, { guardian: true })).toEqual({ to: 'max@example.com', guardian: false });
		expect(confirmationRecipient({ ...kim, guardianEmail: null } as TandemPassenger, { guardian: true })).toBeNull();
	});
});

describe('payChoices (public booking payment options)', () => {
	const stripe = { id: 'stripe' as const, label: 'Card', description: '' };
	test('an unpriced tandem is always pay at the dropzone, a priced one keeps the DZ options', () => {
		expect(payChoices({ options: [stripe] }, false)).toEqual([MANUAL_OPTION]);
		expect(payChoices({ options: [stripe] }, true)).toEqual([stripe]);
	});
});
