<script lang="ts">
	/**
	 * "Skip to content": the first focusable element on the page, visible only when focused.
	 * Works without JS (plain `#id` link; the target needs `tabindex="-1"`). Once hydrated it
	 * focuses the target directly so the URL doesn't gain a `#main` (pages keep view state in it).
	 */
	let { target = 'main' }: { target?: string } = $props();

	function skip(event: MouseEvent) {
		const el = document.getElementById(target);
		if (!el) return;
		event.preventDefault();
		el.focus();
	}
</script>

<a
	href="#{target}"
	onclick={skip}
	class="sr-only z-[60] rounded-lg bg-primary text-sm font-semibold text-primary-fg shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-4 focus:py-2"
	>Skip to content</a
>
