<script lang="ts">
	import { Card } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import JumpForm from '#lib/components/jumper/JumpForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Log a jump</title></svelte:head>

<PageHeader title="Log jump #{data.values.jumpNumber}" back={{ href: '/app/logbook', label: 'Logbook' }} />

<div class="mx-auto max-w-2xl">
	<Card>
		<JumpForm values={data.values} dropzones={data.dropzones} rigs={data.rigs} action="" submitLabel="Save jump" error={form?.message} />
	</Card>
</div>
