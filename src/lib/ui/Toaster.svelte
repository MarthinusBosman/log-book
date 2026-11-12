<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { toast } from './toast.svelte.ts';
	import { cn } from './cn.ts';

	const tone = {
		info: 'bg-primary',
		success: 'bg-success',
		error: 'bg-danger'
	};
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[100] lg:bottom-0 flex flex-col items-center gap-2 p-4 sm:items-end"
	aria-live="polite"
	role="status"
>
	{#each toast.items as t (t.id)}
		<div
			animate:flip={{ duration: 200 }}
			in:fly={{ y: 16, duration: 200 }}
			out:fly={{ x: 24, duration: 150 }}
			class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-elevated p-4 shadow-xl shadow-black/30"
		>
			<span class={cn('mt-1.5 size-2 shrink-0 rounded-full', tone[t.tone])}></span>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-medium text-fg">{t.title}</p>
				{#if t.description}<p class="mt-0.5 text-sm text-muted">{t.description}</p>{/if}
			</div>
			<button
				type="button"
				class="text-subtle transition-colors hover:text-fg"
				aria-label="Dismiss"
				onclick={() => toast.dismiss(t.id)}
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><path d="M18 6 6 18M6 6l12 12" /></svg
				>
			</button>
		</div>
	{/each}
</div>
