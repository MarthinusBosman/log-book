<script lang="ts">
	import { Card } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import RigForm from '#lib/components/jumper/RigForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Add gear</title></svelte:head>

<PageHeader title="Add gear" back={{ href: '/app/my-gear', label: 'My gear' }} />
<div class="mx-auto max-w-2xl">
	<Card>
		<RigForm values={form?.values ?? {}} exitWeightKg={data.ctx.exitWeightKg} intervalDays={data.ctx.intervalDays} today={data.ctx.today} action="" submitLabel="Add to my gear" error={form?.message} />
	</Card>
</div>
