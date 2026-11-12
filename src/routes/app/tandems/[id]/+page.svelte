<script lang="ts">
	import { Button, Icon } from '#lib/ui/index.ts';
	import PassengerDetail from '#lib/components/tandems/PassengerDetail.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const p = $derived(data.detail.passenger);
</script>

<svelte:head><title>{p.name} · Tandem</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<Button variant="ghost" size="sm" href="/app/tandems?day={p.jumpDate ?? ''}" class="-ml-2 mb-4">
		<span aria-hidden="true">‹</span> All tandems
	</Button>
	<div class="rounded-2xl border border-border bg-surface p-5 sm:p-6">
		<PassengerDetail detail={data.detail} dz={data.dz} offer={data.offer} limits={data.limits} />
	</div>
	<p class="mt-4 flex items-center gap-2 text-xs text-subtle"><Icon name="shield" class="size-3.5" /> Changes are saved immediately and visible to manifest.</p>
</div>
