/**
 * Outbound email behind a tiny interface. Only a console implementation exists for now;
 * add Resend/Postmark/SMTP/Cloudflare Email implementations later and pick one in `getMailer()`.
 */
export type EmailMessage = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

export interface Mailer {
	send(message: EmailMessage): Promise<void>;
}

export class ConsoleMailer implements Mailer {
	async send(message: EmailMessage): Promise<void> {
		console.info(
			`\n[email] to=${message.to}\n[email] subject=${message.subject}\n${message.text}\n[email] ---`
		);
	}
}

let mailer: Mailer = new ConsoleMailer();

export function getMailer(): Mailer {
	return mailer;
}

/** For tests / alternate providers. */
export function setMailer(m: Mailer): void {
	mailer = m;
}
