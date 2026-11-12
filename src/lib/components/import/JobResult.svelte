<script lang="ts">
	import { Button, Card } from '#lib/ui/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import { COUNT_LABELS } from '#lib/import/bundle.ts';
	import type { ImportJob } from '#lib/server/db/schema.ts';
	import Glyph from './Glyph.svelte';

	let { job, nextHref, nextLabel, basePath }: { job: ImportJob; nextHref: string; nextLabel: string; basePath: string } = $props();

	const ok = $derived(job.status === 'succeeded');
	const counts = $derived(
		Object.entries(job.counts as Record<string, number>).filter(([k, n]) => n > 0 && COUNT_LABELS[k] && k !== 'dropzone')
	);
	const notes = $derived(job.log.filter((l) => !l.startsWith('[dropzone]')));
</script>

<Card class="relative overflow-hidden" data-testid="import-result">
	<div
		class="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full blur-3xl {ok ? 'bg-success/15' : 'bg-danger/15'}"
		aria-hidden="true"
	></div>
	<div class="relative flex items-start gap-4">
		<span class="grid size-12 shrink-0 place-items-center rounded-2xl {ok ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}">
			{#if ok}<Icon name="check" class="size-6" />{:else}<Glyph name="alert" class="size-6" />{/if}
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="text-lg font-semibold">{ok ? 'Import complete' : 'Import failed'}</h2>
			<p class="text-sm text-muted">
				{ok ? 'Running the same import again updates these records — it never duplicates them.' : (job.error ?? 'Unknown error')}
			</p>
			{#if counts.length}
				<dl class="mt-4 flex flex-wrap gap-x-6 gap-y-3">
					{#each counts as [k, n] (k)}
						<div>
							<dt class="text-xs text-muted">{COUNT_LABELS[k]}</dt>
							<dd class="text-xl font-semibold tabular-nums" data-testid="result-{k}">{n.toLocaleString()}</dd>
						</div>
					{/each}
				</dl>
			{/if}
			{#if notes.length}
				<details class="mt-4 text-sm">
					<summary class="cursor-pointer text-muted hover:text-fg">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</summary>
					<ul class="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-muted">
						{#each notes as n, i (i)}<li>{n}</li>{/each}
					</ul>
				</details>
			{/if}
			<div class="mt-5 flex flex-wrap gap-2">
				{#if ok}<Button href={nextHref}>{nextLabel}</Button>{/if}
				<Button href={basePath} variant="secondary">Import something else</Button>
			</div>
		</div>
	</div>
</Card>
