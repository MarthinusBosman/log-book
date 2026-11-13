/** Outbound email message + the provider-agnostic interface (no env access: safe in unit tests). */
export type EmailMessage = {
	to: string;
	subject: string;
	text: string;
	html?: string;
	/**
	 * Provider-side de-duplication key (Resend keeps it 24 h): the same key is sent at most once.
	 * Use one per logical email, e.g. per password-reset token or per invite. Unset = the mailer
	 * generates one per `send()` call, so its own retries can't duplicate the message.
	 */
	idempotencyKey?: string;
};

/**
 * Placeholder addresses we create ourselves (deleted-account tombstones, imported people without an
 * email) use the reserved `.invalid` TLD (RFC 2606): never deliverable, never shown, never sent to.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
	return !!email && /\.invalid$/i.test(email.trim());
}

export interface Mailer {
	/** Resolves once the provider accepted the message; throws `EmailError` otherwise. */
	send(message: EmailMessage): Promise<void>;
}

export class EmailError extends Error {
	constructor(
		message: string,
		readonly status: number | null = null,
		readonly retryable = false
	) {
		super(message);
		this.name = 'EmailError';
	}
}

export class ConsoleMailer implements Mailer {
	async send(message: EmailMessage): Promise<void> {
		console.info(`\n[email] to=${message.to}\n[email] subject=${message.subject}\n${message.text}\n[email] ---`);
	}
}
