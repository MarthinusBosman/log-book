<script lang="ts" module>
	import type { MIconName } from './MIcon.svelte';
	import type { SlotExtra } from '#lib/domain/constants.ts';
	export const EXTRA_ICONS: Record<SlotExtra, MIconName> = {
		gear_rental: 'pack',
		extra_altitude: 'up',
		max_altitude: 'upup',
		special_event: 'star',
		handcam: 'camera',
		outside_video: 'video',
		extreme_ride: 'zap',
		beach_landing: 'waves'
	};
</script>

<script lang="ts">
	import MIcon from './MIcon.svelte';
	import { SLOT_EXTRA_LABELS, SLOT_STAFF_ROLE_LABELS, type SlotStaffRole } from '#lib/domain/constants.ts';
	import { cn } from '#lib/ui/cn.ts';

	type Props = {
		staffRole: SlotStaffRole | null;
		isLoadMaster?: boolean;
		tandemPassenger?: boolean;
		extras?: SlotExtra[];
		colour?: string | null;
		/** Membership warning chip, e.g. "PASA expired". */
		warning?: string | null;
		size?: 'sm' | 'lg';
		class?: string;
	};
	let { staffRole, isLoadMaster = false, tandemPassenger = false, extras = [], colour = null, warning = null, size = 'sm', class: className }: Props = $props();

	const roleTone: Record<SlotStaffRole, string> = {
		tandem_instructor: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30',
		videographer: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
		coach: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
		aff_instructor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
		jumpmaster: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
	};
	const short: Record<SlotStaffRole, string> = { ...SLOT_STAFF_ROLE_LABELS, jumpmaster: 'JM' };
	const chip = $derived(
		cn('inline-flex items-center rounded-md border font-semibold tracking-wide uppercase', size === 'lg' ? 'px-2 py-0.5 text-sm' : 'px-1.5 text-[10px] leading-4')
	);
</script>

<span class={cn('inline-flex flex-wrap items-center gap-1', className)}>
	{#if staffRole}
		<span
			class={cn(chip, roleTone[staffRole])}
			style={colour && staffRole === 'tandem_instructor' ? `border-color: ${colour}; color: ${colour}; background: color-mix(in srgb, ${colour} 14%, transparent)` : undefined}
			title={SLOT_STAFF_ROLE_LABELS[staffRole]}>{short[staffRole]}</span
		>
	{/if}
	{#if tandemPassenger && !staffRole}
		<span class={cn(chip, 'border-primary/30 bg-primary/10 text-primary')}>Tandem</span>
	{/if}
	{#if warning}
		<span class={cn(chip, 'border-danger/30 bg-danger/10 text-danger')} title="This jumper's membership has expired, or is not connected." data-testid="slot-membership-warning">{warning}</span>
	{/if}
	{#if isLoadMaster}
		<span class={cn(chip, 'border-fg/20 bg-fg/10 text-fg')} title="Load master">LM</span>
	{/if}
	{#each extras as e (e)}
		<span class="inline-grid place-items-center text-muted" title={SLOT_EXTRA_LABELS[e]}>
			<MIcon name={EXTRA_ICONS[e]} class={size === 'lg' ? 'size-5' : 'size-3.5'} />
			<span class="sr-only">{SLOT_EXTRA_LABELS[e]}</span>
		</span>
	{/each}
</span>
