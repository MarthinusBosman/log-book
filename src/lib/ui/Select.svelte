<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { cn } from './cn.ts';

	type Option = { value: string; label: string; disabled?: boolean };
	type Props = {
		label?: string;
		hint?: string;
		error?: string | null;
		options: Option[];
		placeholder?: string;
		class?: string;
		value?: string;
	} & Omit<HTMLSelectAttributes, 'class' | 'value'>;

	let {
		label,
		hint,
		error,
		options,
		placeholder,
		class: className,
		id,
		value = $bindable(),
		...rest
	}: Props = $props();

	const uid = $props.id();
	const selectId = $derived(id ?? `sel-${uid}`);
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	{#if label}
		<label for={selectId} class="text-sm font-medium text-fg">{label}</label>
	{/if}
	<div class="relative">
		<select
			id={selectId}
			bind:value
			aria-invalid={error ? true : undefined}
			class={cn(
				'h-11 w-full appearance-none rounded-xl border bg-surface pr-10 pl-3.5 text-[15px] text-fg',
				'transition-[border-color,box-shadow] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15',
				error ? 'border-danger' : 'border-border hover:border-border-strong'
			)}
			{...rest}
		>
			{#if placeholder}<option value="" disabled>{placeholder}</option>{/if}
			{#each options as opt (opt.value)}
				<option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
			{/each}
		</select>
		<svg
			class="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
		>
	</div>
	{#if error}
		<p class="text-sm text-danger">{error}</p>
	{:else if hint}
		<p class="text-sm text-muted">{hint}</p>
	{/if}
</div>
