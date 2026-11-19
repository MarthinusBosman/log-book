/** Dashboard greeting for an hour of the day (0–23, DZ time); null = timezone unknown. */
export function timeGreeting(hour: number | null): string {
	if (hour === null) return 'Welcome';
	// Before dawn "Good morning" reads odd (and "Good evening" at 03:00 too): stay neutral.
	if (hour < 5) return 'Hello';
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

/**
 * Salutation line for emails. People invited without a name get the email's local part as a
 * placeholder name ("pete.pilot"); greeting them with it reads like a bug, so say "Hi," instead.
 */
export function emailHi(name: string | null | undefined, email?: string | null): string {
	const n = name?.trim();
	if (!n || isPlaceholderName(n, email)) return 'Hi,';
	return `Hi ${n},`;
}

/** True when `name` is empty or just the email's local part (the name given to nameless invitees). */
export function isPlaceholderName(name: string | null | undefined, email?: string | null): boolean {
	const n = name?.trim().toLowerCase();
	if (!n) return true;
	return !!email && n === email.split('@')[0]?.toLowerCase();
}
