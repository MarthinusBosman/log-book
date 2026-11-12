<script lang="ts" generics="T extends Record<string, unknown>">
	import type { Snippet } from 'svelte';
	import { cn } from './cn.ts';

	type Column = { key: string; label: string; align?: 'left' | 'right' | 'center'; class?: string };
	type Props = {
		columns: Column[];
		rows: T[];
		/** Custom cell renderer; falls back to `String(row[key])`. */
		cell?: Snippet<[{ row: T; column: Column }]>;
		empty?: Snippet;
		rowKey?: (row: T, i: number) => string | number;
		class?: string;
	};

	let { columns, rows, cell, empty, rowKey = (_r, i) => i, class: className }: Props = $props();

	const align = { left: 'text-left', right: 'text-right', center: 'text-center' };
</script>

<div class={cn('overflow-x-auto rounded-2xl border border-border bg-surface', className)}>
	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b border-border bg-surface-2/60">
				{#each columns as col (col.key)}
					<th
						scope="col"
						class={cn(
							'px-4 py-3 text-xs font-medium tracking-wide text-muted uppercase',
							align[col.align ?? 'left'],
							col.class
						)}>{col.label}</th
					>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, i (rowKey(row, i))}
				<tr class="border-b border-border/70 transition-colors last:border-0 hover:bg-surface-2/50">
					{#each columns as col (col.key)}
						<td class={cn('px-4 py-3 text-fg', align[col.align ?? 'left'], col.class)}>
							{#if cell}{@render cell({ row, column: col })}{:else}{String(row[col.key] ?? '')}{/if}
						</td>
					{/each}
				</tr>
			{:else}
				<tr>
					<td colspan={columns.length} class="px-4 py-10 text-center text-muted">
						{#if empty}{@render empty()}{:else}Nothing here yet.{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
