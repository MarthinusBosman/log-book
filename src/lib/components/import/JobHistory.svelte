<script lang="ts">
	import { Badge, Card } from '#lib/ui/index.ts';
	import { COUNT_LABELS } from '#lib/import/bundle.ts';
	import type { ImportJob } from '#lib/server/db/schema.ts';
	import Glyph from './Glyph.svelte';

	let { jobs, activeId = null }: { jobs: ImportJob[]; activeId?: string | null } = $props();

	const fmt = (d: Date | string | null) =>
		d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
	const summary = (c: Record<string, number | undefined>) =>
		Object.entries(c)
			.filter(([k, n]) => n && COUNT_LABELS[k] && k !== 'dropzone')
			.slice(0, 4)
			.map(([k, n]) => `${n} ${COUNT_LABELS[k].toLowerCase()}`)
			.join(' · ');
	const tone = { succeeded: 'success', failed: 'danger', running: 'warning', pending: 'neutral' } as const;
</script>

<Card padded={false}>
	<div class="flex items-center gap-2 border-b border-border px-5 py-3.5">
		<Glyph name="history" class="size-4 text-subtle" />
		<h2 class="text-sm font-semibold">Import history</h2>
	</div>
	{#if jobs.length}
		<ul class="divide-y divide-border" data-testid="job-history">
			{#each jobs as j (j.id)}
				<li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 {j.id === activeId ? 'bg-primary/5' : ''}">
					<Badge tone={tone[j.status]} dot>{j.status}</Badge>
					<span class="text-sm">{j.source === 'jumpmaster' ? 'Jump Master' : 'File'}</span>
					<span class="min-w-0 flex-1 truncate text-sm text-muted">{j.error ?? summary(j.counts as Record<string, number>) ?? ''}</span>
					<time class="text-xs text-subtle tabular-nums">{fmt(j.createdAt)}</time>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="px-5 py-6 text-sm text-muted">No imports yet.</p>
	{/if}
</Card>
