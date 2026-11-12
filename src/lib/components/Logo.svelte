<script lang="ts">
	import { brand } from '#lib/brand.ts';
	import { cn } from '#lib/ui/cn.ts';
	let { class: className, showName = true }: { class?: string; showName?: boolean } = $props();
</script>

<span class={cn('inline-flex items-center gap-2.5 font-semibold tracking-tight', className)}>
	<span
		class="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow"
	>
		<svg viewBox="0 0 32 32" class="size-5" aria-hidden="true">
			<path d="M5 15a11 11 0 0 1 22 0" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" />
			<path
				d="M5 15l11 10 11-10M16 15v10"
				fill="none"
				stroke="white"
				stroke-opacity="0.75"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</span>
	{#if showName}<span class="text-lg">{brand.name}</span>{/if}
</span>
