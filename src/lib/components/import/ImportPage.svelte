<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ImportPageData, ConnectorPublicConfig } from '#lib/server/import/web.ts';
	import ConnectorCard from './ConnectorCard.svelte';
	import UploadCard from './UploadCard.svelte';
	import PreviewPanel from './PreviewPanel.svelte';
	import JobResult from './JobResult.svelte';
	import JobHistory from './JobHistory.svelte';

	let {
		mode,
		title,
		subtitle,
		data,
		form,
		basePath,
		nextHref,
		nextLabel,
		templateHref,
		timezone = null,
		currency = null,
		aside
	}: {
		mode: 'jumper' | 'dropzone';
		title: string;
		subtitle: string;
		data: ImportPageData & { connector: ConnectorPublicConfig | null };
		form: { message?: string } | null | undefined;
		basePath: string;
		nextHref: string;
		nextLabel: string;
		templateHref?: string;
		timezone?: string | null;
		currency?: string | null;
		aside?: Snippet;
	} = $props();

	const step = $derived(data.job ? 3 : data.preview ? 2 : 1);
	const steps = ['Choose source', 'Preview', 'Done'];
</script>

<div class="mx-auto max-w-5xl">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
			<p class="mt-1 max-w-2xl text-muted">{subtitle}</p>
		</div>
		{@render aside?.()}
	</header>

	<ol class="mt-6 flex items-center gap-2 text-sm" aria-label="Progress">
		{#each steps as s, i (s)}
			{@const n = i + 1}
			<li class="flex items-center gap-2 {n === step ? 'text-fg' : 'text-subtle'}" aria-current={n === step ? 'step' : undefined}>
				<span
					class="grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums {n < step
						? 'bg-primary/15 text-primary'
						: n === step
							? 'bg-primary text-primary-fg'
							: 'border border-border'}">{n}</span
				>
				<span class="hidden font-medium sm:inline">{s}</span>
			</li>
			{#if n < steps.length}<li class="h-px w-6 bg-border sm:w-10" aria-hidden="true"></li>{/if}
		{/each}
	</ol>

	{#if form?.message}
		<p class="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert" data-testid="import-error">
			{form.message}
		</p>
	{/if}

	<div class="mt-6 space-y-6">
		{#if data.job}
			<JobResult job={data.job} {nextHref} {nextLabel} {basePath} />
		{:else if data.preview}
			<PreviewPanel preview={data.preview} />
		{:else}
			<div class="grid gap-6 lg:grid-cols-2">
				<ConnectorCard {mode} config={data.connector} {timezone} {currency} />
				<UploadCard {mode} {templateHref} />
			</div>
		{/if}
		<JobHistory jobs={data.jobs} activeId={data.job?.id} />
	</div>
</div>
