import type { SubmitFunction } from '$app/forms';
import { toast } from '#lib/ui/toast.svelte.ts';
import { confirmed } from './manifest.ts';

type Opts = {
	/** Toast title on success (omit for silent). */
	success?: string | ((data: Record<string, unknown>) => string | undefined);
	onSuccess?: (data: Record<string, unknown>) => void;
	onError?: (message: string, data: Record<string, unknown>) => void;
	/** Reset the form after success (default false — dialogs usually close instead). */
	reset?: boolean;
	pending?: (busy: boolean) => void;
	/**
	 * Ask before submitting; "Cancel" aborts. Must go through here: an `onsubmit` handler calling
	 * `preventDefault()` does NOT stop `use:enhance`, which had already sent the request.
	 */
	confirm?: string | (() => string);
};

/**
 * `use:enhance={act({...})}` — progressive enhancement for manifest forms: toasts friendly domain
 * errors, keeps the page in place and re-runs load functions after success.
 */
export function act(opts: Opts = {}): SubmitFunction {
	return ({ cancel }) => {
		if (!confirmed(opts.confirm)) return cancel();
		opts.pending?.(true);
		return async ({ result, update }) => {
			opts.pending?.(false);
			if (result.type === 'failure') {
				const data = (result.data ?? {}) as Record<string, unknown>;
				const message = String(data.message ?? 'Something went wrong');
				toast.error(message);
				opts.onError?.(message, data);
				return;
			}
			if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Something went wrong');
				return;
			}
			if (result.type === 'success') {
				const data = (result.data ?? {}) as Record<string, unknown>;
				const t = typeof opts.success === 'function' ? opts.success(data) : opts.success;
				if (t) toast.success(t);
				opts.onSuccess?.(data);
				await update({ reset: opts.reset ?? false });
				return;
			}
			await update();
		};
	};
}
