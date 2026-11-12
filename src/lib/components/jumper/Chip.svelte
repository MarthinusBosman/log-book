<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/ui/index.ts';

	/** Checkbox/radio rendered as a pill — thumb-friendly multi-select for extras, jump types, days. */
	type Props = {
		name: string;
		value: string;
		type?: 'checkbox' | 'radio';
		checked?: boolean;
		class?: string;
		children: Snippet;
		onchange?: (e: Event) => void;
	};
	let { name, value, type = 'checkbox', checked = $bindable(false), class: className, children, onchange }: Props = $props();
</script>

<label class={cn('relative inline-flex cursor-pointer select-none', className)}>
	{#if type === 'radio'}
		<input type="radio" {name} {value} {checked} {onchange} class="peer sr-only" />
	{:else}
		<input type="checkbox" {name} {value} bind:checked {onchange} class="peer sr-only" />
	{/if}
	<span
		class="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-muted transition-all peer-checked:border-primary/50 peer-checked:bg-primary/10 peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:border-border-strong"
	>
		{@render children()}
	</span>
</label>
