<!--
	Two-step destructive action that works before hydration and without JS: the trigger is
	a <summary>, the question + real submit form are revealed inline. Cancel is a link back
	to the same URL (no JS) that just closes the panel when JS runs. Replaces confirm(),
	which only guarded enhanced posts — a pre-hydration tap deleted straight away.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { cn } from './cn.ts';

	type Props = {
		/** Trigger content (icon + label). */
		trigger: Snippet;
		/** The question shown once the trigger is opened. */
		question: string;
		/** The real form (method=POST) with the confirming submit button. */
		children: Snippet;
		/** Optional text on the same row as the trigger. */
		lead?: string;
		class?: string;
		triggerClass?: string;
		testid?: string;
	};
	let { trigger, question, children, lead, class: className, triggerClass, testid }: Props = $props();

	let el = $state<HTMLDetailsElement>();
	const cancelHref = $derived(page.url.pathname + page.url.search);
</script>

<details bind:this={el} class={cn('group', className)} data-testid={testid}>
	<summary class={cn('flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden', lead ? 'justify-between' : 'justify-center')}>
		{#if lead}<span class="text-sm text-muted">{lead}</span>{/if}
		<span
			class={cn(
				'inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-danger transition-colors hover:bg-surface-2 group-open:bg-surface-2',
				triggerClass
			)}>{@render trigger()}</span
		>
	</summary>
	<div class="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-3" role="group" aria-label="Confirm">
		<p class="text-sm">{question}</p>
		<div class="mt-3 flex flex-wrap items-center justify-end gap-2">
			<a
				href={cancelHref}
				class="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium text-fg hover:bg-elevated"
				onclick={(e) => {
					e.preventDefault();
					if (el) el.open = false;
					el?.querySelector('summary')?.focus();
				}}>Cancel</a
			>
			{@render children()}
		</div>
	</div>
</details>
