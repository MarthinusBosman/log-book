<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '#lib/ui/index.ts';
	import type { IconName } from '#lib/ui/Icon.svelte';
	import JIcon from './JIcon.svelte';

	type Props = {
		title: string;
		description?: string;
		icon?: IconName;
		back?: { href: string; label: string };
		actions?: Snippet;
	};
	let { title, description, icon, back, actions }: Props = $props();
</script>

<div class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
	<div class="min-w-0">
		{#if back}
			<a href={back.href} class="mb-3 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg">
				<JIcon name="chevronLeft" class="size-4" />{back.label}
			</a>
		{/if}
		<div class="flex items-center gap-3">
			{#if icon}
				<span class="hidden size-11 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary sm:grid">
					<Icon name={icon} />
				</span>
			{/if}
			<div class="min-w-0">
				<h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
				{#if description}<p class="mt-0.5 text-sm text-muted">{description}</p>{/if}
			</div>
		</div>
	</div>
	{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
