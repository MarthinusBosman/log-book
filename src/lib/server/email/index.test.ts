import { expect, test } from 'bun:test';
import { getMailer, isPlaceholderEmail, setMailer, type EmailMessage } from './index.ts';

test('placeholder (.invalid) recipients are never sent to', async () => {
	const sent: EmailMessage[] = [];
	setMailer({ send: async (m) => void sent.push(m) });
	await getMailer().send({ to: 'deleted-abc@deleted.invalid', subject: 's', text: 't' });
	await getMailer().send({ to: 'import-123@placeholder.INVALID ', subject: 's', text: 't' });
	await getMailer().send({ to: 'jumper@example.com', subject: 's', text: 't' });
	setMailer(null);
	expect(sent.map((m) => m.to)).toEqual(['jumper@example.com']);
	expect(isPlaceholderEmail('a@b.invalid')).toBe(true);
	expect(isPlaceholderEmail('a@invalid.com')).toBe(false);
	expect(isPlaceholderEmail(null)).toBe(false);
});
