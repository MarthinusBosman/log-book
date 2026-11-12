<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './cn.ts';

	type Props = {
		title?: string;
		/** Heading level of the title: 2 (default) right under the page's h1, 3 inside an h2 section. */
		level?: 2 | 3 | 4;
		description?: string;
		actions?: Snippet;
		footer?: Snippet;
		padded?: boolean;
		interactive?: boolean;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'title'>;

	let {
		title,
		level = 2,
		description,
		actions,
		footer,
		padded = true,
		interactive = false,
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<div
	class={cn(
		'rounded-2xl border border-border bg-surface',
		interactive && 'transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/10',
		className
	)}
	{...rest}
>
	{#if title || actions}
		<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
			<div class="min-w-0">
				{#if title}<svelte:element this={`h${level}`} class="font-semibold tracking-tight text-fg">{title}</svelte:element>{/if}
				{#if description}<p class="mt-0.5 text-sm text-muted">{description}</p>{/if}
			</div>
			{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
		</div>
	{/if}
	<div class={cn(padded && 'p-5')}>
		{@render children?.()}
	</div>
	{#if footer}
		<div class="border-t border-border px-5 py-3">{@render footer()}</div>
	{/if}
</div>
