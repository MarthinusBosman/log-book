<script lang="ts">
	import { cn } from '#lib/ui/index.ts';

	type Props = { value?: string; placeholder?: string; label?: string; name?: string; class?: string };
	let { value = $bindable(''), placeholder = 'Search', label = 'Search', name, class: className }: Props = $props();
</script>

<div class={cn('relative', className)}>
	<svg class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
		><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg
	>
	<input
		bind:value
		{name}
		type="search"
		{placeholder}
		aria-label={label}
		class="h-10 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15"
	/>
</div>
