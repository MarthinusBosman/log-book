<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import { toast } from '#lib/ui/index.ts';
	import { successNotice } from './no-js-outcome.ts';

	/**
	 * Lives in the /app layout. Jumper pages toast an action's `success` line from `use:enhance`;
	 * without JS (or a post before hydration) the page renders again with nothing visible, so this
	 * shows the line instead. Once hydrated it renders nothing (a pre-hydration message moves
	 * into a toast), so enhanced submits keep using toasts only.
	 */
	let hydrated = $state(false);
	onMount(() => {
		const text = successNotice(page.form, page.status);
		if (text) toast.success(text);
		hydrated = true;
	});
	const text = $derived(hydrated ? null : successNotice(page.form, page.status));
</script>

{#if text}
	<div data-testid="no-js-success" class="mb-4">
		<FormAlert tone="success" message={text} />
	</div>
{/if}
