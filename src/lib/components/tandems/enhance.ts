import type { SubmitFunction } from '$app/forms';
import { toast } from '#lib/ui/toast.svelte.ts';

type Opts = {
	reset?: boolean;
	onSuccess?: () => void;
	/** Return a message to block with an error toast, `false` to block silently, null to continue. */
	before?: (f: FormData) => string | false | null;
	/** Called with true when the request starts and false when it settles. */
	pending?: (on: boolean) => void;
};

/** use:enhance callback: toast the action's message, then let SvelteKit update/invalidate. */
export function toastEnhance(opts: Opts = {}): SubmitFunction {
	return ({ formData, cancel }) => {
		const problem = opts.before?.(formData) ?? null;
		if (problem !== null) {
			if (problem) toast.error(problem);
			cancel();
			return;
		}
		opts.pending?.(true);
		return async ({ result, update }) => {
			try {
				if (result.type === 'failure') toast.error(String((result.data as { message?: string } | undefined)?.message ?? 'Something went wrong'));
				else if (result.type === 'success') {
					const msg = (result.data as { message?: string } | undefined)?.message;
					if (msg) toast.success(msg);
					opts.onSuccess?.();
				} else if (result.type === 'redirect') opts.onSuccess?.();
				else if (result.type === 'error') toast.error(result.error?.message ?? 'Something went wrong');
				// navigate: false — stay on this page even when the action lives on another route (drawer → /app/tandems/[id])
				await update({ reset: opts.reset ?? false, navigate: false });
			} finally {
				opts.pending?.(false);
			}
		};
	};
}
