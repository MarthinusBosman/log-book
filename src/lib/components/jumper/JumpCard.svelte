<script lang="ts">
	import { Badge, cn } from '#lib/ui/index.ts';
	import { JUMP_TYPE_LABELS, type JumpType } from '#lib/domain/constants.ts';
	import type { JumpRow } from '#lib/server/jumper/logbook.ts';
	import JIcon from './JIcon.svelte';
	import { fmtDate, fmtFreefall, fmtNumber } from './format.ts';

	let { jump: j, class: className }: { jump: JumpRow; class?: string } = $props();
</script>

<a
	href="/app/logbook/{j.id}"
	class={cn('flex gap-3 rounded-2xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2/30 sm:gap-4 sm:p-4', className)}
	data-testid="jump-card"
>
	<span class="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 py-2 sm:w-16">
		<span class="text-[10px] font-medium tracking-wider text-muted uppercase">Jump</span>
		<span class="text-lg leading-tight font-semibold tabular-nums">{j.jumpNumber}</span>
	</span>
	<span class="min-w-0 flex-1">
		<span class="flex items-start justify-between gap-2">
			<span class="min-w-0">
				<span class="block truncate font-medium">{j.place ?? 'Unknown location'}</span>
				<span class="block text-sm text-muted">
					{fmtDate(j.jumpDate)}{j.jumpType ? ` · ${JUMP_TYPE_LABELS[j.jumpType as JumpType] ?? j.jumpType}` : ''}
				</span>
			</span>
			<span class="flex shrink-0 flex-wrap justify-end gap-1">
				{#if j.verified}<Badge tone="success"><JIcon name="badgeCheck" class="size-3.5" /> Verified</Badge>{/if}
				{#if j.signedAt}<Badge tone="brand"><JIcon name="pen" class="size-3" /> Signed</Badge>{/if}
			</span>
		</span>
		<span class="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted tabular-nums">
			{#if j.aircraft}<span>{j.aircraft}</span>{/if}
			{#if j.altitudeFt}<span>{fmtNumber(j.altitudeFt)} ft</span>{/if}
			{#if j.freefallSeconds}<span>{fmtFreefall(j.freefallSeconds)} freefall</span>{/if}
			{#if j.source === 'load'}<span class="text-primary">Auto-logged from load</span>{:else if j.source === 'import'}<span>Imported</span>{/if}
		</span>
		{#if j.description}<span class="mt-1 line-clamp-1 block text-sm text-fg/80">{j.description}</span>{/if}
	</span>
</a>
