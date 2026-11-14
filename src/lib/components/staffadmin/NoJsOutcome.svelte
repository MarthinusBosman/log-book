<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import { toast } from '#lib/ui/index.ts';
	import { formOutcome } from './no-js-outcome.ts';

	/**
	 * Staff forms report their outcome as a toast (`toastEnhance`), which needs JS. Without JS (or
	 * when a form is posted before hydration) the page renders again with `page.form` set and
	 * nothing visible: this shows that message instead. Once hydrated it renders nothing, so
	 * enhanced submits keep using toasts only (a message from a pre-hydration post moves into a
	 * toast). Use it on pages whose forms don't show `form` inline.
	 */
	let { class: className = 'mt-4' }: { class?: string } = $props();
	let hydrated = $state(false);
	onMount(() => {
		const o = formOutcome(page.form, page.status);
		if (o) (o.ok ? toast.success : toast.error)(o.text);
		hydrated = true;
	});
	const outcome = $derived(hydrated ? null : formOutcome(page.form, page.status));
</script>

{#if outcome}
	<div data-testid="no-js-outcome" class={className}>
		<FormAlert tone={outcome.ok ? 'success' : 'error'} message={outcome.text} />
	</div>
{/if}
