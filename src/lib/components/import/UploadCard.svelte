<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card } from '#lib/ui/index.ts';
	import {
		CSV_FIELDS,
		CSV_FIELD_LABELS,
		autoMapping,
		looksLikeHeader,
		parseCsv,
		rowsToJumps,
		type CsvMapping,
		type DateOrder
	} from '#lib/import/csv.ts';
	import Glyph from './Glyph.svelte';
	import { brand } from '#lib/brand.ts';

	let { mode, templateHref }: { mode: 'jumper' | 'dropzone'; templateHref?: string } = $props();

	let fileName = $state('');
	let submitting = $state(false);
	let dragging = $state(false);
	let rows = $state<string[][]>([]);
	let hasHeader = $state(true);
	let dateOrder = $state<DateOrder>('auto');
	let mapping = $state<CsvMapping | null>(null);
	let input: HTMLInputElement | undefined = $state();

	const header = $derived(rows.length && hasHeader ? rows[0] : null);
	const width = $derived(rows.reduce((n, r) => Math.max(n, r.length), 0));
	const columnOptions = $derived(
		Array.from({ length: width }, (_, i) => ({ value: i, label: header?.[i] ? `${header[i]}` : `Column ${i + 1}` }))
	);
	const data = $derived(hasHeader ? rows.slice(1) : rows);
	const sample = $derived(mapping ? rowsToJumps(data.slice(0, 200), mapping, dateOrder) : null);

	async function onFile() {
		const f = input?.files?.[0];
		fileName = f?.name ?? '';
		rows = [];
		mapping = null;
		if (!f || mode !== 'jumper') return;
		const text = await f.text();
		if (text.trimStart().startsWith('{')) return; // JSON bundle — nothing to map
		rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
		hasHeader = rows[0] ? looksLikeHeader(rows[0]) : false;
		mapping = hasHeader ? autoMapping(rows[0]) : (Object.fromEntries(CSV_FIELDS.map((k, i) => [k, i])) as CsvMapping);
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (input && e.dataTransfer?.files.length) {
			input.files = e.dataTransfer.files;
			onFile();
		}
	}
</script>

<Card class="flex flex-col">
	<div class="flex items-start gap-3">
		<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Glyph name="upload" /></span>
		<div class="min-w-0">
			<h2 class="font-semibold">Upload a file</h2>
			<p class="mt-0.5 text-sm text-muted">
				{#if mode === 'jumper'}
					A {brand.name} export (<code class="text-xs">.json</code>), a Jump Master data file, or a logbook spreadsheet saved as CSV.
				{:else}
					A dropzone export (<code class="text-xs">.json</code>) from another instance, or a Jump Master dropzone data file.
				{/if}
			</p>
		</div>
	</div>

	<form
		method="POST"
		action="?/upload"
		enctype="multipart/form-data"
		class="mt-5 flex flex-1 flex-col gap-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
				submitting = false;
			};
		}}
	>
		<input type="hidden" name="source" value="file" />
		<label
			class="group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors {dragging
				? 'border-primary bg-primary/5'
				: 'border-border hover:border-border-strong hover:bg-surface-2/50'}"
			ondragover={(e) => {
				e.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={drop}
		>
			<Glyph name={fileName.endsWith('.csv') ? 'sheet' : 'file'} class="size-7 text-subtle transition-colors group-hover:text-primary" />
			{#if fileName}
				<span class="max-w-full truncate text-sm font-medium" data-testid="upload-name">{fileName}</span>
				<span class="text-xs text-muted">Click to choose a different file</span>
			{:else}
				<span class="text-sm font-medium">Drop a file here or <span class="text-primary">browse</span></span>
				<span class="text-xs text-muted">{mode === 'jumper' ? 'JSON or CSV' : 'JSON'} · up to 10 MB</span>
			{/if}
			<input
				bind:this={input}
				type="file"
				name="file"
				required
				accept={mode === 'jumper' ? '.json,.csv,.tsv,.txt,application/json,text/csv' : '.json,application/json'}
				class="absolute inset-0 cursor-pointer opacity-0"
				onchange={onFile}
				data-testid="import-file"
			/>
		</label>

		{#if mapping && rows.length}
			<div class="rounded-2xl border border-border bg-surface-2/40 p-4" data-testid="csv-mapping">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-sm font-medium">Match your columns</p>
					<div class="flex flex-wrap items-center gap-3 text-sm">
						<label class="inline-flex items-center gap-2 text-muted">
							<input type="checkbox" name="hasHeader" bind:checked={hasHeader} class="size-4 accent-[var(--dz-primary)]" />
							First row is a header
						</label>
						<input type="hidden" name="hasHeader" value={hasHeader ? 'true' : 'false'} disabled={hasHeader} />
						<label class="inline-flex items-center gap-2 text-muted">
							Dates
							<select name="dateOrder" bind:value={dateOrder} class="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-fg">
								<option value="auto">Auto</option>
								<option value="ymd">YYYY-MM-DD</option>
								<option value="dmy">DD/MM/YYYY</option>
								<option value="mdy">MM/DD/YYYY</option>
							</select>
						</label>
					</div>
				</div>
				<div class="mt-3 grid gap-y-2">
					{#each CSV_FIELDS as f (f)}
						<label class="flex items-center justify-between gap-3 text-sm">
							<span class="truncate text-muted">{CSV_FIELD_LABELS[f]}{f === 'jumpDate' ? ' *' : ''}</span>
							<select
								name="map_{f}"
								bind:value={mapping[f]}
								class="h-8 w-44 shrink-0 rounded-lg border border-border bg-surface px-2 text-sm text-fg"
							>
								<option value={-1}>— not in file —</option>
								{#each columnOptions as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
							</select>
						</label>
					{/each}
				</div>
				{#if sample}
					<p class="mt-3 text-xs text-muted">
						<span class="font-medium text-fg">{sample.jumps.length}</span> of the first {Math.min(data.length, 200)} rows read
						{#if sample.errors.length}· <span class="text-warning">{sample.errors.length} need attention</span>{/if}
						{#if sample.jumps[0]}· first: #{sample.jumps[0].jumpNumber ?? '–'}, {sample.jumps[0].jumpDate}{sample.jumps[0].location ? `, ${sample.jumps[0].location}` : ''}{/if}
					</p>
				{/if}
			</div>
		{/if}

		<div class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
			{#if templateHref}
				<a href={templateHref} class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg" download>
					<Glyph name="download" class="size-4" /> CSV template
				</a>
			{:else}<span></span>{/if}
			<Button type="submit" loading={submitting} data-testid="upload-submit">Preview import</Button>
		</div>
	</form>
</Card>
