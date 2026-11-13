<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button } from '#lib/ui/index.ts';
	import { act } from './forms.ts';
	import { formAction, pageWithoutAction } from './manifest.ts';

	/**
	 * No-JS confirmation step: a destructive action posted without `confirmed=1` (no JS, or a tap
	 * before hydration) comes back with `form.confirm`; this re-posts the same fields confirmed.
	 */
	type Step = { action: string; message: string; label: string; fields: Record<string, string> };
	let { step }: { step: Step } = $props();

	const DONE: Record<string, string> = {
		complete: 'Load completed',
		cancel: 'Load cancelled',
		deleteLoad: 'Load has been deleted',
		removeSlot: 'Removed from load'
	};
	// after a native POST the URL is `?/action`: go back to the page without it
	const back = $derived(pageWithoutAction(page.url));
</script>

<div role="alertdialog" aria-labelledby="confirm-step-msg" class="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3" data-testid="confirm-step">
	<p id="confirm-step-msg" class="text-sm font-medium text-fg">{step.message}</p>
	<form method="POST" action={formAction(page.url, step.action)} class="mt-3 flex flex-wrap items-center gap-2" use:enhance={act({ success: DONE[step.action] })}>
		{#each Object.entries(step.fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<input type="hidden" name="confirmed" value="1" />
		<Button type="submit" size="sm" variant={step.action === 'complete' ? 'primary' : 'danger'}>{step.label}</Button>
		<Button href={back} size="sm" variant="ghost">Go back</Button>
	</form>
</div>
