<script lang="ts">
	import { cn } from './cn.ts';

	type Props = { name: string; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg'; class?: string };
	let { name, src, size = 'md', class: className }: Props = $props();

	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);
	// Deterministic hue per name so avatars are distinguishable at a glance.
	const hue = $derived([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 210));
	const sizes = { xs: 'size-6 text-[10px]', sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-sm' };
</script>

{#if src}
	<img {src} alt={name} loading="lazy" decoding="async" class={cn('shrink-0 rounded-full bg-surface-2 object-cover', sizes[size], className)} />
{:else}
	<span
		class={cn('grid shrink-0 place-items-center rounded-full font-semibold text-white', sizes[size], className)}
		style="background: linear-gradient(135deg, hsl({hue} 75% 55%), hsl({(hue + 40) % 360} 80% 42%))"
		aria-label={name}
		role="img">{initials}</span
	>
{/if}
