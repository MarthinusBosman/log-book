<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
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
	const FOCUSABLE =
		'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"]),summary,iframe,[contenteditable]';
	// unique per instance: pages often render several dialogs
	const uid = $props.id();

	// A dialog that starts open (driven by the URL, e.g. ?new=1) is server-rendered with the
	// `open` attribute, so it shows before hydration and without JS. That is a NON-modal
	// dialog; once hydrated, the effect re-opens it as a modal (backdrop, focus trap, Escape).
	const ssrOpen = untrack(() => open) || undefined;
	let reopening = false;

	$effect(() => {
		if (!el) return;
		if (open && el.open && !isModal(el)) {
			reopening = true; // the async close event from this hand-over must not close it for real
			el.close();
			el.showModal();
		} else if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});

	// A read-only body (e.g. a waiver preview) has nothing to Tab to, so keyboard users
	// couldn't scroll it (focus sits on Close in the header). Make the scroll area itself a
	// tab stop only while it holds no focusable element (WCAG 2.1.1, axe scrollable-region-focusable).
	// Set imperatively: a reactive attribute in this template re-runs the dialog's attribute
	// effect, which drops the `open` that showModal() set and closes the dialog.
	let body: HTMLDivElement | undefined;

	$effect(() => {
		if (!open || !body) return;
		const b = body;
		const label = title ?? 'Dialog content';
		const update = () => {
			if (b.querySelector(FOCUSABLE)) {
				b.removeAttribute('tabindex');
				b.removeAttribute('role');
				b.removeAttribute('aria-label');
			} else {
				b.tabIndex = 0;
				b.setAttribute('role', 'region');
				b.setAttribute('aria-label', label);
			}
		};
		update();
		const mo = new MutationObserver(update);
		mo.observe(b, { childList: true, subtree: true });
		return () => mo.disconnect();
	});

	// Same for the labels: pages pass a title that changes with what's open (e.g. "Roles · Mia"
	// → "" on close). As template attributes, that change re-ran the attribute effect, which
	// dropped `open` while the dialog stayed modal in the top layer: an invisible backdrop
	// blocked every click on the page. SSR still gets them via the initial values below.
	const ssrLabelledBy = untrack(() => (title ? `${uid}-title` : undefined));
	const ssrDescribedBy = untrack(() => (title && description ? `${uid}-desc` : undefined));
	$effect(() => {
		if (!el) return;
		const set = (name: string, v: string | undefined) => (v ? el!.setAttribute(name, v) : el!.removeAttribute(name));
		set('aria-labelledby', title ? `${uid}-title` : undefined);
		set('aria-describedby', title && description ? `${uid}-desc` : undefined);
	});

	function isModal(d: HTMLDialogElement) {
		try {
			return d.matches(':modal');
		} catch {
			return true; // no :modal support: leave it as it is
		}
	}

	function handleClose() {
		if (reopening) {
			reopening = false;
			return;
		}
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
	open={ssrOpen}
	aria-labelledby={ssrLabelledBy}
	aria-describedby={ssrDescribedBy}
	onclose={handleClose}
	onclick={(e) => {
		// click on the backdrop (the dialog element itself) closes
		if (e.target === el) open = false;
	}}
	class={cn(
		'border border-border bg-elevated p-0 text-fg shadow-2xl shadow-black/40',
		'backdrop:bg-black/60 backdrop:backdrop-blur-sm backdrop:animate-fade-in',
		// server-rendered open (non-modal until hydration): pin it like the modal would be
		'[&:not(:modal)]:fixed [&:not(:modal)]:inset-0 [&:not(:modal)]:z-50',
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
				<!-- method="dialog" closes natively, so this also works before hydration / without JS -->
				<form method="dialog" class="contents">
					<button
						type="submit"
						class="-mt-1 -mr-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
						aria-label="Close"
					>
						<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
							><path d="M18 6 6 18M6 6l12 12" /></svg
						>
					</button>
				</form>
			</header>
		{/if}
		<!-- scroll area; becomes a labelled tab stop only when the body has no controls (see above) -->
		<div
			bind:this={body}
			class="scrollbar-thin flex-1 overflow-y-auto px-5 pb-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
		>
			{@render children?.()}
		</div>
		{#if footer}
			<footer class="flex justify-end gap-2 border-t border-border px-5 py-3">{@render footer()}</footer>
		{/if}
	</div>
</dialog>
