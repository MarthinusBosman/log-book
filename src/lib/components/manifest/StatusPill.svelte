<script lang="ts">
	import { LOAD_STATUS_LABELS, type LoadStatus } from '#lib/domain/constants.ts';
	import { cn } from '#lib/ui/cn.ts';
	import Countdown from './Countdown.svelte';

	let { status, callDueAt = null, class: className }: { status: LoadStatus; callDueAt?: number | null; class?: string } = $props();

	const tones: Record<LoadStatus, string> = {
		planned: 'bg-surface-2 text-muted border-border',
		open: 'bg-success/10 text-success border-success/25',
		called: 'bg-warning/10 text-warning border-warning/30',
		boarding: 'bg-danger/10 text-danger border-danger/30',
		departed: 'bg-primary/10 text-primary border-primary/25',
		landed: 'bg-primary/10 text-primary border-primary/25',
		completed: 'bg-surface-2 text-subtle border-border',
		cancelled: 'bg-surface-2 text-subtle border-border line-through'
	};
</script>

<span
	class={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[status], className)}
	data-status={status}
>
	{#if status === 'called' || status === 'boarding'}<span class="size-1.5 animate-pulse rounded-full bg-current"></span>{/if}
	{status === 'open' ? 'Open' : LOAD_STATUS_LABELS[status]}
	{#if status === 'called' && callDueAt}<Countdown due={callDueAt} class="text-current" />{/if}
</span>
