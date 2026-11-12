<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { title: string; back: string; children: Snippet };
	let { title, back, children }: Props = $props();
</script>

<svelte:head><title>{title}</title></svelte:head>

<div class="min-h-dvh bg-bg px-3 py-6 sm:px-6 print:min-h-0 print:bg-white print:p-0">
	<div class="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-3 print:hidden">
		<a href={back} class="text-sm text-muted hover:text-fg">← Back to reports</a>
		<button
			type="button"
			onclick={() => window.print()}
			class="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-fg shadow-sm hover:opacity-90"
		>
			Print / save as PDF
		</button>
	</div>
	<article
		class="paper mx-auto max-w-4xl rounded-2xl bg-white p-6 text-zinc-900 shadow-xl ring-1 ring-black/5 sm:p-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0"
	>
		{@render children()}
	</article>
</div>

<style>
	@media print {
		@page {
			size: A4;
			margin: 14mm;
		}
		:global(html),
		:global(body) {
			background: #fff !important;
		}
	}
	.paper :global(table) {
		border-collapse: collapse;
	}
</style>
