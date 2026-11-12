<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from '#lib/ui/index.ts';

	type Props = { label?: string; hint?: string; class?: string; value?: string | null } & Omit<HTMLTextareaAttributes, 'class' | 'value'>;
	let { label, hint, class: className, id, value = $bindable(), ...rest }: Props = $props();
	const uid = $props.id();
	const tid = $derived(id ?? `ta-${uid}`);
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	{#if label}<label for={tid} class="text-sm font-medium text-fg">{label}</label>{/if}
	<textarea
		id={tid}
		bind:value
		class="min-h-24 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] text-fg transition-[border-color,box-shadow] outline-none placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15"
		{...rest}
	></textarea>
	{#if hint}<p class="text-sm text-muted">{hint}</p>{/if}
</div>
