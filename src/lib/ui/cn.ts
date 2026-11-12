/** Tiny className joiner (no tailwind-merge dependency — keep variant classes non-conflicting). */
export function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
