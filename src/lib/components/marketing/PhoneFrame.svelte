<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/ui/cn.ts';

	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<div
	class={cn(
		'w-[17rem] rounded-[2.6rem] border border-border-strong bg-surface-2 p-2 shadow-[0_30px_80px_-20px_rgb(4_12_32/0.55)] dark:shadow-[0_30px_90px_-20px_rgb(0_0_0/0.8)]',
		className
	)}
	aria-hidden="true"
>
	<div class="relative overflow-hidden rounded-[2.1rem] border border-border bg-bg">
		<div class="flex h-9 items-center justify-between px-6 pt-1 text-[11px] font-semibold tabular-nums">
			<span>09:48</span>
			<span class="h-5 w-20 rounded-full bg-black dark:bg-black/80"></span>
			<span class="flex items-center gap-1">
				<span class="flex items-end gap-px"><i class="h-1.5 w-0.5 bg-current"></i><i class="h-2 w-0.5 bg-current"></i><i class="h-2.5 w-0.5 bg-current"></i></span>
				<span class="h-2.5 w-5 rounded-[3px] border border-current p-px"><span class="block h-full w-3/4 rounded-[1px] bg-current"></span></span>
			</span>
		</div>
		<div class="px-4 pt-2 pb-5">
			{@render children()}
		</div>
	</div>
</div>
