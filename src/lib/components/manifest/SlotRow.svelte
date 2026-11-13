<script lang="ts">
	import { JUMP_TYPE_LABELS, formatMoney, paymentMethodLabel } from '#lib/domain/constants.ts';
	import { cn } from '#lib/ui/cn.ts';
	import type { SlotVM } from './types.ts';
	import SlotTags from './SlotTags.svelte';
	import MIcon from './MIcon.svelte';
	import Avatar from '#lib/ui/Avatar.svelte';
	import { groupHue } from './manifest.ts';

	type Props = {
		slot: SlotVM;
		currency: string;
		draggable?: boolean;
		showMoney?: boolean;
		ondragstart?: (e: DragEvent, slot: SlotVM) => void;
		ondragend?: () => void;
		class?: string;
	};
	let { slot, currency, draggable = false, showMoney = true, ondragstart, ondragend, class: className }: Props = $props();

	const stripe = $derived(slot.colour ?? (slot.groupId ? `hsl(${groupHue(slot.groupId)} 70% 55%)` : (slot.tiColour ?? 'transparent')));
</script>

<li
	class={cn(
		'group/slot relative flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-3 text-sm transition-colors hover:bg-surface-2/70',
		draggable && 'cursor-grab active:cursor-grabbing',
		className
	)}
	draggable={draggable ? 'true' : undefined}
	ondragstart={(e) => ondragstart?.(e, slot)}
	{ondragend}
	data-testid="slot-row"
	data-slot-id={slot.id}
>
	<span class="absolute inset-y-1.5 left-0.5 w-1 rounded-full" style="background: {stripe}" aria-hidden="true"></span>
	<Avatar name={slot.displayName} src={slot.avatar} size="xs" />
	<span class="min-w-0 flex-1">
		<span class="flex min-w-0 items-center gap-1.5">
			<span class="truncate font-medium text-fg">{slot.displayName}</span>
			<SlotTags staffRole={slot.staffRole} isLoadMaster={slot.isLoadMaster} tandemPassenger={!!slot.tandemPassengerId} extras={slot.extras} colour={slot.tiColour} warning={slot.membershipWarning} />
		</span>
		<span class="block truncate text-xs text-muted">
			{JUMP_TYPE_LABELS[slot.jumpType] ?? slot.jumpType}{#if slot.teamName}<span class="text-subtle">{' · '}{slot.teamName}</span>{/if}{#if slot.weightKg}<span class="text-subtle">{' · '}{Math.round(slot.weightKg)} kg</span>{/if}
		</span>
	</span>
	{#if showMoney}
		<span class="shrink-0 text-right text-xs">
			{#if slot.staffRole && slot.totalMinor === 0}
				<span class="text-subtle">Staff</span>
			{:else if slot.paid}
				<span class="inline-flex items-center gap-1 font-medium text-success" title="Paid{slot.paidVia ? ` (${paymentMethodLabel(slot.paidVia)})` : ''}"><MIcon name="check" class="size-3.5" />Paid</span>
			{:else}
				<span class={cn('font-medium tabular-nums', slot.held ? 'text-muted' : 'text-warning')} title={slot.held ? 'Reserved in wallet' : 'Unpaid'}>
					{formatMoney(slot.totalMinor, currency)}
				</span>
				<span class="block text-[10px] text-subtle">{slot.held ? 'wallet' : 'unpaid'}</span>
			{/if}
		</span>
	{/if}
</li>
