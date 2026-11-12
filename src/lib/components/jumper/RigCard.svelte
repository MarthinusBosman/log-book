<script lang="ts">
	import { Badge, Icon, cn } from '#lib/ui/index.ts';
	import type { RigView } from '#lib/server/jumper/gear.ts';
	import JIcon from './JIcon.svelte';
	import { DUE_TONES, dueLabel, fmtDate } from './format.ts';

	let { rig }: { rig: RigView } = $props();
	const bar = { ok: 'bg-success', due_soon: 'bg-warning', overdue: 'bg-danger', unknown: 'bg-border-strong' } as const;
</script>

<a href="/app/my-gear/{rig.id}" class="group block overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-strong" data-testid="rig-card">
	<div class="flex items-start gap-3 p-4 sm:p-5">
		<span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon name="parachute" class="size-6" /></span>
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<h3 class="truncate font-semibold tracking-tight">{rig.title}</h3>
					<p class="truncate text-sm text-muted">{[rig.container !== rig.title ? rig.container : null, rig.mainCanopy && `${rig.mainCanopy}${rig.mainSizeSqft ? ` ${rig.mainSizeSqft}` : ''}`].filter(Boolean).join(' · ') || 'No canopy details'}</p>
				</div>
				{#if rig.wingLoading}<span class="shrink-0 rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium tabular-nums">WL {rig.wingLoading.toFixed(2)}</span>{/if}
			</div>
		</div>
	</div>
	<div class="grid grid-cols-2 border-t border-border">
		{#each [{ label: 'Reserve repack', info: rig.repack, sub: rig.reserveRepackedOn ? `Packed ${fmtDate(rig.reserveRepackedOn)}` : 'Not set' }, { label: rig.aad ?? 'AAD', info: rig.aadDue, sub: rig.aadDue.dueOn ? `Due ${fmtDate(rig.aadDue.dueOn)}` : 'No dates set' }] as cell, i (i)}
			<div class={cn('relative px-4 py-3 sm:px-5', i === 0 && 'border-r border-border')}>
				<span class={cn('absolute inset-y-3 left-0 w-0.5 rounded-full', bar[cell.info.status])}></span>
				<p class="truncate text-xs text-muted">{cell.label}</p>
				<p class="mt-0.5"><Badge tone={DUE_TONES[cell.info.status]}>{dueLabel(cell.info, { ok: 'OK' })}</Badge></p>
				<p class="mt-1 truncate text-xs text-subtle">{cell.sub}</p>
			</div>
		{/each}
	</div>
	{#if rig.wingsuit}
		<p class="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted sm:px-5"><JIcon name="chevronRight" class="size-3" /> Wingsuit: {rig.wingsuit}</p>
	{/if}
</a>
