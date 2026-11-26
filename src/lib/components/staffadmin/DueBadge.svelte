<script lang="ts">
	import { Badge } from '#lib/ui/index.ts';
	import type { DueStatus } from '#lib/domain/constants.ts';
	import { dueBadgeText } from './due-badge.ts';

	type Props = { status: DueStatus; dueOn: string | null; daysLeft: number | null; cause?: 'service' | 'end_of_life' | null; empty?: string };
	let { status, dueOn, daysLeft, cause = null, empty = 'Not set' }: Props = $props();

	const tone = $derived(status === 'overdue' ? 'danger' : status === 'due_soon' ? 'warning' : status === 'ok' ? 'success' : 'neutral');
	const label = $derived(dueBadgeText({ status, dueOn, daysLeft, cause }, empty));
</script>

<span class="inline-flex flex-col items-start gap-0.5">
	<Badge {tone} dot={status === 'overdue' || status === 'due_soon'}>{label.text}</Badge>
	{#if label.sub}<span class="pl-1 text-[11px] text-subtle tabular-nums">{label.sub}</span>{/if}
</span>
