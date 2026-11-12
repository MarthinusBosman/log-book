<script lang="ts">
	import { Button, Dialog } from '#lib/ui/index.ts';
	import MIcon from './MIcon.svelte';
	import type { CompleteSummary } from './types.ts';

	let { summary = $bindable(null) }: { summary: CompleteSummary | null } = $props();
	let open = $state(false);
	$effect(() => {
		open = !!summary;
	});
	const rows = $derived(
		summary
			? [
					{ label: 'Logbook entries written', value: summary.logbookEntries },
					{ label: 'Wallet slots charged', value: summary.charged },
					{ label: 'Staff / pilot pay lines', value: summary.staffPaid },
					{ label: 'Jumpers notified', value: summary.notified }
				]
			: []
	);
</script>

<Dialog bind:open onclose={() => (summary = null)}>
	{#if summary}
		<div class="pt-6 text-center" data-testid="complete-summary">
			<div class="mx-auto grid size-14 place-items-center rounded-2xl bg-success/15 text-success">
				<MIcon name="check" class="size-7" strokeWidth={2.5} />
			</div>
			<h2 class="mt-4 text-lg font-semibold tracking-tight">Load {summary.loadNumber} completed</h2>
			<p class="mt-1 text-sm text-muted">Logged on everyone's logbook. Blue skies!</p>
		</div>
		<dl class="mt-5 grid grid-cols-2 gap-2">
			{#each rows as r (r.label)}
				<div class="rounded-xl border border-border bg-surface p-3">
					<dt class="text-xs text-muted">{r.label}</dt>
					<dd class="mt-0.5 text-xl font-semibold tabular-nums">{r.value}</dd>
				</div>
			{/each}
		</dl>
		<Button class="mt-5 w-full" onclick={() => (open = false)}>Done</Button>
	{/if}
</Dialog>
