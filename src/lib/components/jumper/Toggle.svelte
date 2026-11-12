<script lang="ts">
	import { cn } from '#lib/ui/index.ts';

	type Props = { name: string; label: string; hint?: string; checked?: boolean; value?: string; class?: string; disabled?: boolean };
	let { name, label, hint, checked = $bindable(false), value = 'on', class: className, disabled }: Props = $props();
</script>

<label class={cn('flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong', disabled && 'opacity-60', className)}>
	<span class="min-w-0">
		<span class="block text-sm font-medium text-fg">{label}</span>
		{#if hint}<span class="mt-0.5 block text-sm text-muted">{hint}</span>{/if}
	</span>
	<span class="relative mt-0.5 inline-flex shrink-0">
		<input type="checkbox" {name} {value} bind:checked {disabled} class="peer sr-only" />
		<span class="h-6 w-11 rounded-full bg-surface-2 ring-1 ring-border-strong transition-colors peer-checked:bg-primary peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"></span>
		<span class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
	</span>
</label>
