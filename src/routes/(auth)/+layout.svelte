<script lang="ts">
	import Logo from '#lib/components/Logo.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { brand } from '#lib/brand.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
	<!-- Form side -->
	<div class="relative flex flex-col px-5 py-6 sm:px-10">
		<header class="flex items-center justify-between">
			<a href="/" aria-label="{brand.name} home"><Logo /></a>
			<ThemeToggle />
		</header>
		<main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12 animate-slide-up">
			{@render children()}
		</main>
		<footer class="text-center text-xs text-subtle">
			© {new Date().getFullYear()} {brand.name}. Blue skies. ·
			<a href={brand.sourceUrl} rel="noopener" class="underline-offset-2 hover:text-fg hover:underline">Source code</a>
			({brand.license}) ·
			<a href="/privacy" class="underline-offset-2 hover:text-fg hover:underline">Privacy</a> ·
			<a href="/terms" class="underline-offset-2 hover:text-fg hover:underline">Terms</a>
		</footer>
	</div>

	<!-- Visual side -->
	<aside
		class="relative hidden overflow-hidden border-l border-border bg-[#050a15] lg:block"
		aria-hidden="true"
	>
		<div class="bg-chart absolute inset-0"></div>
		<div
			class="absolute -top-40 -right-40 size-[38rem] rounded-full bg-brand-500/25 blur-[120px]"
		></div>
		<div class="absolute -bottom-48 -left-20 size-[30rem] rounded-full bg-cyan-400/10 blur-[110px]"></div>
		<div class="relative flex h-full flex-col justify-end p-12 text-white">
			<div class="max-w-md">
				<p class="text-sm font-medium tracking-widest text-brand-300 uppercase">Load 7 · 13 500 ft</p>
				<p class="mt-4 text-3xl leading-tight font-semibold tracking-tight">
					“Manifest used to be a whiteboard and a prayer. Now the whole dropzone runs from a phone.”
				</p>
				<div class="mt-8 grid grid-cols-3 gap-3 text-sm">
					{#each [['Slots', '18/23'], ['Call', '12 min'], ['Winds', '9 kt']] as [k, v] (k)}
						<div class="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
							<p class="text-white/50">{k}</p>
							<p class="mt-1 text-lg font-semibold tabular-nums">{v}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</aside>
</div>
