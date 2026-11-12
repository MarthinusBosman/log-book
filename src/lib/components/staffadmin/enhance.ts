import type { SubmitFunction } from '$app/forms';
import { toast } from '#lib/ui/index.ts';

type Opts = {
	/** Toast title on success; defaults to `result.data.message` or "Saved". */
	success?: string;
	reset?: boolean;
	onSuccess?: (data: Record<string, unknown> | undefined) => void;
	/** Track pending state (e.g. to disable a button). */
	pending?: (v: boolean) => void;
};

/** `use:enhance={toastEnhance({...})}`: toast the outcome, keep form values, refresh data. */
export function toastEnhance(opts: Opts = {}): SubmitFunction {
	return () => {
		opts.pending?.(true);
		return async ({ result, update }) => {
			opts.pending?.(false);
			if (result.type === 'success') {
				const data = result.data as Record<string, unknown> | undefined;
				toast.success(opts.success ?? (typeof data?.message === 'string' ? data.message : 'Saved'));
				opts.onSuccess?.(data);
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				toast.error(msg ?? 'Please check the form and try again.');
			} else if (result.type === 'error') {
				toast.error('Something went wrong', result.error?.message);
			}
			await update({ reset: opts.reset ?? false });
		};
	};
}
