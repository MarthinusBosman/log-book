<script lang="ts">
	import { cn } from '#lib/ui/index.ts';

	type Props = { name: string; label: string; description?: string; checked?: boolean; disabled?: boolean; class?: string };
	let { name, label, description, checked = $bindable(false), disabled = false, class: className }: Props = $props();
	const uid = $props.id();
</script>

<label
	for="sw-{uid}"
	class={cn(
		'flex cursor-pointer items-start justify-between gap-4 rounded-xl px-1 py-3',
		disabled && 'cursor-not-allowed opacity-60',
		className
	)}
>
	<span class="min-w-0">
		<span class="block text-sm font-medium text-fg">{label}</span>
		{#if description}<span class="mt-0.5 block text-sm text-muted">{description}</span>{/if}
	</span>
	<span class="relative mt-0.5 inline-flex shrink-0">
		<input id="sw-{uid}" type="checkbox" role="switch" {name} bind:checked {disabled} class="peer sr-only" />
		<span
			class="h-6 w-11 rounded-full border border-border-strong bg-surface-2 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-4 peer-focus-visible:ring-primary/25"
		></span>
		<span
			class="pointer-events-none absolute top-1 left-1 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
		></span>
	</span>
</label>
