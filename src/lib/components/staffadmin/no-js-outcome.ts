/** What a form action answered, for showing it without JS (see `NoJsOutcome.svelte`). */
export type FormOutcome = { ok: boolean; text: string };

/**
 * `page.form` + `page.status` → the message to show, or null when there is none. Actions answer
 * `{ message }` on success and `fail(4xx, { message })` on failure; a failure without a message
 * still gets a generic line so the post isn't silently swallowed.
 *
 * `untaggedOnly`: skip answers carrying an `action` tag — pages that render those inline next to
 * the form that posted (branding's colour + logo cards) only need the rest (e.g. `runAction`'s
 * "no permission" / "select a dropzone" failures, which carry no tag).
 */
export function formOutcome(form: unknown, status: number, opts: { untaggedOnly?: boolean } = {}): FormOutcome | null {
	if (!form || typeof form !== 'object') return null;
	if (opts.untaggedOnly && typeof (form as { action?: unknown }).action === 'string') return null;
	const raw = (form as { message?: unknown }).message;
	const text = typeof raw === 'string' ? raw.trim() : '';
	const ok = status < 400;
	if (text) return { ok, text };
	return ok ? null : { ok, text: 'Please check the form and try again.' };
}

/**
 * Jumper-side actions answer `{ success: '…' }` (shown as a toast with JS) and render their
 * errors inline. Without JS that success line would be lost: this returns it so the /app layout
 * can show it (`NoJsSuccess.svelte`). Actions whose page already renders it (logbook
 * sign-off, `ImageUpload`'s `success` prop) also return `successShownInline: true`.
 */
export function successNotice(form: unknown, status: number): string | null {
	if (!form || typeof form !== 'object' || status >= 400) return null;
	const f = form as { success?: unknown; successShownInline?: unknown };
	if (f.successShownInline) return null;
	const text = typeof f.success === 'string' ? f.success.trim() : '';
	return text || null;
}
