<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '#lib/ui/index.ts';
	import type { IconName } from '#lib/ui/Icon.svelte';

	type Props = { icon: IconName; title: string; description?: string; actions?: Snippet; children?: Snippet };
	let { icon, title, description, actions, children }: Props = $props();
</script>

<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
	<div class="flex min-w-0 items-center gap-3">
		<span class="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-primary">
			<Icon name={icon} />
		</span>
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold tracking-tight">{title}</h1>
			{#if description}<p class="text-sm text-muted">{description}</p>{/if}
		</div>
	</div>
	{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
{@render children?.()}
