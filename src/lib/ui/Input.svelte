<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from './cn.ts';

	type Props = {
		label?: string;
		hint?: string;
		error?: string | null;
		class?: string;
		value?: HTMLInputAttributes['value'];
	} & Omit<HTMLInputAttributes, 'class' | 'value'>;

	let {
		label,
		hint,
		error,
		class: className,
		id,
		value = $bindable(),
		...rest
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `in-${uid}`);
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	{#if label}
		<label for={inputId} class="text-sm font-medium text-fg">{label}</label>
	{/if}
	<input
		id={inputId}
		bind:value
		aria-invalid={error ? true : undefined}
		aria-describedby={error || hint ? `${inputId}-desc` : undefined}
		class={cn(
			'h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] text-fg placeholder:text-subtle',
			'transition-[border-color,box-shadow] duration-150 outline-none',
			'focus:border-primary focus:ring-4 focus:ring-primary/15',
			error ? 'border-danger' : 'border-border hover:border-border-strong'
		)}
		{...rest}
	/>
	{#if error}
		<p id="{inputId}-desc" class="text-sm text-danger">{error}</p>
	{:else if hint}
		<p id="{inputId}-desc" class="text-sm text-muted">{hint}</p>
	{/if}
</div>
