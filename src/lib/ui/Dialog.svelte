<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './cn.ts';

	type Props = {
		open?: boolean;
		title?: string;
		description?: string;
		/** `center` = modal dialog; `right`/`left`/`bottom` = sheet. */
		variant?: 'center' | 'right' | 'left' | 'bottom';
		class?: string;
		children?: Snippet;
		footer?: Snippet;
		onclose?: () => void;
	};

	let {
		open = $bindable(false),
		title,
		description,
		variant = 'center',
		class: className,
		children,
		footer,
		onclose
	}: Props = $props();

	let el: HTMLDialogElement | undefined = $state();
	// unique per instance: pages often render several dialogs
	const uid = $props.id();

	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});

	function handleClose() {
		open = false;
		onclose?.();
	}

	const placement = {
		center:
			'm-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl animate-slide-up max-h-[85dvh]',
		right: 'ml-auto mr-0 my-0 h-dvh max-h-dvh w-[min(26rem,100vw)] rounded-l-2xl animate-slide-in-right',
		left: 'mr-auto ml-0 my-0 h-dvh max-h-dvh w-[min(20rem,85vw)] rounded-r-2xl animate-slide-in-left',
		bottom: 'mx-auto mb-0 mt-auto w-full max-w-2xl rounded-t-2xl animate-slide-up max-h-[90dvh]'
	};
</script>

<dialog
	bind:this={el}
	onclose={handleClose}
	onclick={(e) => {
		// click on the backdrop (the dialog element itself) closes
		if (e.target === el) open = false;
	}}
	aria-labelledby={title ? `${uid}-title` : undefined}
	aria-describedby={title && description ? `${uid}-desc` : undefined}
	class={cn(
		'border border-border bg-elevated p-0 text-fg shadow-2xl shadow-black/40',
		'backdrop:bg-black/60 backdrop:backdrop-blur-sm backdrop:animate-fade-in',
		placement[variant],
		className
	)}
>
	<div class="flex h-full flex-col">
		{#if title}
			<header class="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
				<div>
					<h2 id="{uid}-title" class="text-lg font-semibold tracking-tight">{title}</h2>
					{#if description}<p id="{uid}-desc" class="mt-1 text-sm text-muted">{description}</p>{/if}
				</div>
				<button
					type="button"
					class="-mt-1 -mr-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
					aria-label="Close"
					onclick={() => (open = false)}
				>
					<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
						><path d="M18 6 6 18M6 6l12 12" /></svg
					>
				</button>
			</header>
		{/if}
		<div class="scrollbar-thin flex-1 overflow-y-auto px-5 pb-5">
			{@render children?.()}
		</div>
		{#if footer}
			<footer class="flex justify-end gap-2 border-t border-border px-5 py-3">{@render footer()}</footer>
		{/if}
	</div>
</dialog>
