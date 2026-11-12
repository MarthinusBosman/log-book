<script lang="ts" generics="K extends string">
	import { cn } from '#lib/ui/index.ts';
	import type { Sorter } from './sorter.svelte.ts';

	type Props = { sorter: Sorter<K>; key: K; label: string; align?: 'left' | 'right'; class?: string };
	let { sorter, key, label, align = 'left', class: className }: Props = $props();
	const active = $derived(sorter.key === key);
</script>

<th scope="col" aria-sort={sorter.aria(key)} class={cn('px-3 py-2.5 text-xs font-medium tracking-wide text-muted uppercase', align === 'right' ? 'text-right' : 'text-left', className)}>
	<button
		type="button"
		class={cn('inline-flex items-center gap-1 uppercase transition-colors hover:text-fg', active && 'text-fg', align === 'right' && 'flex-row-reverse')}
		onclick={() => sorter.toggle(key)}
	>
		{label}
		<svg class={cn('size-3 transition-transform', !active && 'opacity-30', active && sorter.dir === 'desc' && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
	</button>
</th>
