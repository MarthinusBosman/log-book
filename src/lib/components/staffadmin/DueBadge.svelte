<script lang="ts">
	import { Badge } from '#lib/ui/index.ts';
	import type { DueStatus } from '#lib/domain/constants.ts';

	type Props = { status: DueStatus; dueOn: string | null; daysLeft: number | null; empty?: string };
	let { status, dueOn, daysLeft, empty = 'Not set' }: Props = $props();

	const tone = $derived(status === 'overdue' ? 'danger' : status === 'due_soon' ? 'warning' : status === 'ok' ? 'success' : 'neutral');
	const text = $derived(
		daysLeft == null
			? empty
			: daysLeft < 0
				? `${-daysLeft}d overdue`
				: daysLeft === 0
					? 'Due today'
					: status === 'due_soon'
						? `${daysLeft}d left`
						: dueOn
	);
</script>

<span class="inline-flex flex-col items-start gap-0.5">
	<Badge {tone} dot={status === 'overdue' || status === 'due_soon'}>{text}</Badge>
	{#if dueOn && status !== 'ok'}<span class="pl-1 text-[11px] text-subtle tabular-nums">{dueOn}</span>{/if}
</span>
