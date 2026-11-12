<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Card } from '#lib/ui/index.ts';
	import { COUNT_LABELS } from '#lib/import/bundle.ts';
	import { JUMP_TYPE_LABELS } from '#lib/domain/constants.ts';
	import type { ImportPreview } from '#lib/server/import/apply.ts';
	import Glyph from './Glyph.svelte';

	let { preview }: { preview: ImportPreview & { id: string; label: string; stagedWarnings: string[] } } = $props();
	let submitting = $state(false);

	const counts = $derived(Object.entries(preview.counts).filter(([k, n]) => n > 0 && k !== 'dropzone' && !(preview.mode === 'jumper' && (k === 'people' || k === 'wallets'))));
	const warnings = $derived([...preview.warnings, ...preview.stagedWarnings]);
	const label = (k: string) => COUNT_LABELS[k] ?? k;
	const jt = (t: string | null) => (t ? ((JUMP_TYPE_LABELS as Record<string, string>)[t] ?? t) : '—');
</script>

<Card padded={false} class="overflow-hidden" data-testid="import-preview">
	<div class="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
		<div class="min-w-0">
			<p class="text-xs font-medium tracking-wider text-subtle uppercase">Preview</p>
			<h2 class="mt-0.5 truncate text-lg font-semibold">{preview.label}</h2>
			<p class="text-sm text-muted">Nothing has been imported yet. Check the numbers, then confirm.</p>
		</div>
		<Badge tone="brand">{preview.source === 'jumpmaster' ? 'Jump Master' : preview.source === 'csv' ? 'CSV logbook' : 'Bundle'}</Badge>
	</div>

	<div class="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
		{#each counts as [k, n] (k)}
			<div class="bg-surface px-5 py-4">
				<p class="text-2xl font-semibold tabular-nums" data-testid="count-{k}">{n.toLocaleString()}</p>
				<p class="text-sm text-muted">{label(k)}</p>
			</div>
		{/each}
		{#if preview.mode === 'jumper'}
			<div class="bg-surface px-5 py-4">
				<p class="text-2xl font-semibold tabular-nums text-muted">{preview.alreadyImported.toLocaleString()}</p>
				<p class="text-sm text-muted">Already here (updated)</p>
			</div>
		{:else}
			<div class="bg-surface px-5 py-4">
				<p class="text-2xl font-semibold tabular-nums text-muted">{preview.newPeople.toLocaleString()}</p>
				<p class="text-sm text-muted">New placeholder profiles</p>
			</div>
		{/if}
	</div>

	<div class="space-y-5 px-5 py-5">
		{#if preview.samples.jumps.length}
			<div>
				<p class="mb-2 text-sm font-medium">First jumps</p>
				<div class="overflow-x-auto rounded-xl border border-border">
					<table class="w-full text-sm">
						<thead class="bg-surface-2/60 text-left text-xs text-muted">
							<tr><th class="px-3 py-2 font-medium">#</th><th class="px-3 py-2 font-medium">Date</th><th class="px-3 py-2 font-medium">Location</th><th class="hidden px-3 py-2 font-medium sm:table-cell">Aircraft</th><th class="px-3 py-2 font-medium">Type</th></tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each preview.samples.jumps as j, i (i)}
								<tr>
									<td class="px-3 py-2 tabular-nums text-muted">{j.jumpNumber ?? '—'}</td>
									<td class="px-3 py-2 whitespace-nowrap tabular-nums">{j.jumpDate}</td>
									<td class="max-w-48 truncate px-3 py-2">{j.location ?? '—'}</td>
									<td class="hidden px-3 py-2 sm:table-cell">{j.aircraft ?? '—'}</td>
									<td class="px-3 py-2">{jt(j.jumpType)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
		{#if preview.mode === 'dropzone' && preview.samples.people.length}
			<div class="grid gap-5 lg:grid-cols-2">
				<div>
					<p class="mb-2 text-sm font-medium">People</p>
					<ul class="divide-y divide-border rounded-xl border border-border text-sm">
						{#each preview.samples.people as p, i (i)}
							<li class="flex items-center justify-between gap-3 px-3 py-2">
								<span class="truncate">{p.name}</span><span class="truncate text-xs text-muted">{p.email ?? 'no email'}</span>
							</li>
						{/each}
					</ul>
				</div>
				{#if preview.samples.loads.length}
					<div>
						<p class="mb-2 text-sm font-medium">Latest loads</p>
						<ul class="divide-y divide-border rounded-xl border border-border text-sm">
							{#each preview.samples.loads as l, i (i)}
								<li class="flex items-center justify-between gap-3 px-3 py-2">
									<span class="tabular-nums">{l.day} · Load {l.loadNumber}</span>
									<span class="text-xs text-muted">{l.aircraftName ?? ''} · {l.slots} slots · {l.status}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}

		{#if warnings.length}
			<details class="group rounded-xl border border-warning/30 bg-warning/5" open={warnings.length <= 3}>
				<summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-warning">
					<Glyph name="alert" class="size-4" />
					{warnings.length} {warnings.length === 1 ? 'note' : 'notes'} about this file
				</summary>
				<ul class="max-h-56 list-disc space-y-1 overflow-y-auto px-9 pb-3 text-sm text-muted">
					{#each warnings as w, i (i)}<li>{w}</li>{/each}
				</ul>
			</details>
		{/if}
	</div>

	<div class="flex flex-col-reverse gap-2 border-t border-border bg-surface-2/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
		<form method="POST" action="?/discard" use:enhance>
			<input type="hidden" name="staged" value={preview.id} />
			<Button type="submit" variant="ghost" class="w-full sm:w-auto">Cancel</Button>
		</form>
		<form
			method="POST"
			action="?/confirm"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<input type="hidden" name="staged" value={preview.id} />
			<Button type="submit" loading={submitting} class="w-full sm:w-auto" data-testid="import-confirm">Import now</Button>
		</form>
	</div>
</Card>
