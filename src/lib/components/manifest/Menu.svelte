<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/ui/cn.ts';
	import MIcon from './MIcon.svelte';

	let { label = 'More actions', class: className, panelClass, children }: { label?: string; class?: string; panelClass?: string; children: Snippet } = $props();
	let el: HTMLDetailsElement | undefined = $state();

	$effect(() => {
		const close = (e: Event) => {
			if (el?.open && !el.contains(e.target as Node)) el.open = false;
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && el) el.open = false;
		};
		document.addEventListener('click', close);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('click', close);
			document.removeEventListener('keydown', esc);
		};
	});
</script>

<details bind:this={el} class={cn('relative', className)}>
	<summary
		class="grid size-8 cursor-pointer list-none place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden"
		aria-label={label}
		title={label}
	>
		<MIcon name="more" class="size-5" />
	</summary>
	<div
		class={cn(
			'absolute right-0 z-20 mt-1 w-60 animate-fade-in rounded-xl border border-border bg-elevated p-1.5 shadow-xl shadow-black/20',
			panelClass
		)}
	>
		{@render children()}
	</div>
</details>
