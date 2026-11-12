<script lang="ts">
	import { Button, EmptyState, Icon } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import RigCard from '#lib/components/jumper/RigCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>My gear</title></svelte:head>

<PageHeader title="My gear" icon="parachute" description="Rigs, reserve repacks and AAD service dates.">
	{#snippet actions()}
		<Button href="/app/my-gear/new" data-testid="add-rig"><Icon name="plus" class="size-4" /> Add gear</Button>
	{/snippet}
</PageHeader>

{#if data.active.length === 0 && data.retired.length === 0}
	<EmptyState title="No gear loaded yet" description="Add your rig to track reserve repacks, AAD service dates and your wing loading.">
		{#snippet icon()}<Icon name="parachute" class="size-6" />{/snippet}
		{#snippet action()}<Button href="/app/my-gear/new"><Icon name="plus" class="size-4" /> Add gear</Button>{/snippet}
	</EmptyState>
{:else}
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="rig-list">
		{#each data.active as rig (rig.id)}<RigCard {rig} level={2} />{/each}
	</div>
	{#if data.retired.length}
		<h2 class="mt-8 mb-3 text-sm font-semibold tracking-wider text-muted uppercase">Retired</h2>
		<div class="grid grid-cols-1 gap-4 opacity-75 lg:grid-cols-2">
			{#each data.retired as rig (rig.id)}<RigCard {rig} />{/each}
		</div>
	{/if}
	<p class="mt-6 text-sm text-muted">
		Reserve repack interval: {data.ctx.intervalDays} days{data.ctx.intervalSource ? ` (${data.ctx.intervalSource})` : ''}. Warnings start {data.ctx.warnDays} days before.
	</p>
{/if}
