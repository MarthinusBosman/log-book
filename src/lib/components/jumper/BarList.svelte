<script lang="ts">
	import { cn } from '#lib/ui/index.ts';
	import { fmtFreefall } from './format.ts';

	/** Horizontal bar breakdown (hand-rolled, no chart lib). */
	type Row = { key: string; label: string; jumps: number; freefallSeconds: number };
	let { rows, href, class: className }: { rows: Row[]; href?: (key: string) => string; class?: string } = $props();
	const max = $derived(Math.max(1, ...rows.map((r) => r.jumps)));
</script>

<ul class={cn('space-y-2', className)}>
	{#each rows as r (r.key)}
		<li>
			<svelte:element this={href ? 'a' : 'div'} href={href?.(r.key)} class="group block rounded-lg px-1 py-1 transition-colors hover:bg-surface-2/60">
				<div class="flex items-baseline justify-between gap-2 text-sm">
					<span class="truncate font-medium">{r.label}</span>
					<span class="shrink-0 text-muted tabular-nums"><span class="font-medium text-fg">{r.jumps}</span> · {fmtFreefall(r.freefallSeconds)}</span>
				</div>
				<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
					<div class="h-full rounded-full bg-primary/80 transition-[width] group-hover:bg-primary" style="width: {Math.max(3, (r.jumps / max) * 100)}%"></div>
				</div>
			</svelte:element>
		</li>
	{:else}
		<li class="text-sm text-muted">Nothing to show yet.</li>
	{/each}
</ul>
