<script lang="ts">
	import { clock } from './live.svelte.ts';
	import { formatCountdown } from './manifest.ts';
	import { cn } from '#lib/ui/cn.ts';

	let { due, class: className }: { due: number; class?: string } = $props();

	$effect(() => clock.use());
	const left = $derived(due - clock.now);
</script>

<time
	datetime={new Date(due).toISOString()}
	class={cn('font-semibold tabular-nums', left <= 0 ? 'text-danger' : left <= 5 * 60_000 ? 'text-warning' : '', className)}
	aria-label={left > 0 ? `${Math.ceil(left / 60_000)} minutes to go` : 'Time is up'}>{formatCountdown(left)}</time
>
