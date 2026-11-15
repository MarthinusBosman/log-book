<!--
	Two-step action that works before hydration and without JS: the trigger is
	a <summary>, the question + real submit form are revealed inline. Cancel is a link back
	to the same URL (no JS) that just closes the panel when JS runs. Replaces confirm(),
	which only guarded enhanced posts — a pre-hydration tap deleted (or paid) straight away.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { cn } from './cn.ts';

	type Tone = 'danger' | 'neutral' | 'primary';
	type Props = {
		/** Trigger content (icon + label). */
		trigger: Snippet;
		/** The question shown once the trigger is opened. */
		question: string;
		/** The real form (method=POST) with the confirming submit button. */
		children: Snippet;
		/** Optional text (or markup) on the same row as the trigger. */
		lead?: string | Snippet;
		/** danger (default) = red text trigger; neutral = ghost trigger; primary = filled primary trigger. */
		tone?: Tone;
		class?: string;
		triggerClass?: string;
		testid?: string;
	};
	let { trigger, question, children, lead, tone = 'danger', class: className, triggerClass, testid }: Props = $props();

	const triggerTones: Record<Tone, string> = {
		danger: 'text-danger hover:bg-surface-2 group-open:bg-surface-2',
		neutral: 'text-muted hover:bg-surface-2 hover:text-fg group-open:bg-surface-2 group-open:text-fg',
		primary: 'bg-primary text-primary-fg shadow-sm shadow-brand-500/20 hover:bg-brand-600 group-open:bg-brand-700'
	};
	const panelTones: Record<Tone, string> = {
		danger: 'border-danger/30 bg-danger/5',
		neutral: 'border-border bg-surface-2/60',
		primary: 'border-primary/30 bg-primary/5'
	};

	let el = $state<HTMLDetailsElement>();
	const cancelHref = $derived(page.url.pathname + page.url.search);
</script>

<details bind:this={el} class={cn('group', className)} data-testid={testid}>
	<summary class={cn('flex cursor-pointer list-none flex-wrap items-center gap-3 [&::-webkit-details-marker]:hidden', lead ? 'justify-between' : 'justify-center')}>
		{#if typeof lead === 'string'}<span class="text-sm text-muted">{lead}</span>{:else if lead}{@render lead()}{/if}
		<span
			class={cn(
				'inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
				triggerTones[tone],
				triggerClass
			)}>{@render trigger()}</span
		>
	</summary>
	<div class={cn('mt-3 rounded-xl border p-3', panelTones[tone])} role="group" aria-label="Confirm">
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
