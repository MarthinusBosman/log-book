/** What a form action answered, for showing it without JS (see `NoJsOutcome.svelte`). */
export type FormOutcome = { ok: boolean; text: string };

/**
 * `page.form` + `page.status` → the message to show, or null when there is none. Actions answer
 * `{ message }` on success and `fail(4xx, { message })` on failure; a failure without a message
 * still gets a generic line so the post isn't silently swallowed.
 */
export function formOutcome(form: unknown, status: number): FormOutcome | null {
	if (!form || typeof form !== 'object') return null;
	const raw = (form as { message?: unknown }).message;
	const text = typeof raw === 'string' ? raw.trim() : '';
	const ok = status < 400;
	if (text) return { ok, text };
	return ok ? null : { ok, text: 'Please check the form and try again.' };
}
