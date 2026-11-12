<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './cn.ts';

	type Props = {
		title: string;
		description?: string;
		icon?: Snippet;
		action?: Snippet;
		class?: string;
	};
	let { title, description, icon, action, class: className }: Props = $props();
</script>

<div
	class={cn(
		'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center',
		className
	)}
>
	{#if icon}
		<div
			class="mb-4 grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"
		>
			{@render icon()}
		</div>
	{/if}
	<h3 class="text-base font-semibold tracking-tight text-fg">{title}</h3>
	{#if description}<p class="mt-1.5 max-w-sm text-sm text-muted">{description}</p>{/if}
	{#if action}<div class="mt-5">{@render action()}</div>{/if}
</div>
