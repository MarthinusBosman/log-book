<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '#lib/ui/index.ts';
	import JIcon from './JIcon.svelte';

	let { count = 0 }: { count?: number } = $props();
	const active = $derived(page.url.pathname.startsWith('/app/notifications'));
</script>

<a
	href="/app/notifications"
	class={cn(
		'relative grid size-10 place-items-center rounded-xl transition-colors hover:bg-surface-2 hover:text-fg',
		active ? 'text-primary' : 'text-muted'
	)}
	aria-label={count ? `Notifications (${count} unread)` : 'Notifications'}
	data-testid="notification-bell"
>
	<JIcon name="bell" class="size-[19px]" />
	{#if count > 0}
		<span
			class="absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-bg ring-2 ring-bg tabular-nums"
			data-testid="unread-count">{count > 99 ? '99+' : count}</span
		>
	{/if}
</a>
