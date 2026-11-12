<script lang="ts">
	import { enhance } from '$app/forms';
	import HangarBoard from '#lib/components/manifest/HangarBoard.svelte';
	import Menu from '#lib/components/manifest/Menu.svelte';
	import MIcon from '#lib/components/manifest/MIcon.svelte';
	import { act } from '#lib/components/manifest/forms.ts';
	import { toast } from '#lib/ui/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function fullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.().catch(() => toast.error('Fullscreen is not available here'));
	}
	async function copy(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			toast.success('Display link copied');
		} catch {
			prompt('Copy the display link', url);
		}
	}
	const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-fg hover:bg-surface-2';
</script>

<svelte:head>
	{@html data.brand.style}
	<title>Display · {data.dz.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<HangarBoard dzName={data.dz.name} logoUrl={data.brand.logoUrl} timezone={data.dz.timezone} day={data.day} today={data.today} serverNow={data.serverNow} loads={data.loads} depends="manifest:display">
	{#snippet toolbar()}
		<nav class="flex items-center gap-1" aria-label="Display controls">
			<a href="/app/manifest{data.day !== data.today ? `?day=${data.day}` : ''}" class="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Back to manifest" title="Back to manifest">
				<MIcon name="chevronLeft" class="size-5" />
			</a>
			<button type="button" onclick={fullscreen} class="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Toggle fullscreen" title="Fullscreen">
				<MIcon name="maximize" class="size-5" />
			</button>
			{#if data.canShare}
				<Menu label="Public display link" panelClass="w-80 p-3">
					<p class="text-sm font-semibold">Public display link</p>
					<p class="mt-1 text-xs text-muted">Open on a hangar TV without logging in. Anyone with the link sees names on today's loads — rotate it if it leaks.</p>
					{#if data.publicUrl}
						<div class="mt-3 flex gap-1.5">
							<input readonly value={data.publicUrl} class="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs" aria-label="Public display URL" data-testid="public-url" />
							<button type="button" class="h-9 rounded-lg bg-surface-2 px-3 text-sm font-medium hover:bg-border" onclick={() => copy(data.publicUrl!)}>Copy</button>
						</div>
						<form method="POST" action="?/publicLink" class="mt-2" use:enhance={act({ success: 'New link created — the old one stopped working' })}>
							<button class={item}><MIcon name="refresh" class="size-4 text-muted" /> Rotate link</button>
						</form>
						<form method="POST" action="?/publicLink" use:enhance={act({ success: 'Public display turned off' })}>
							<input type="hidden" name="mode" value="off" />
							<button class="{item} text-danger"><MIcon name="x" class="size-4" /> Turn off</button>
						</form>
					{:else}
						<form method="POST" action="?/publicLink" class="mt-3" use:enhance={act({ success: 'Public display link created' })}>
							<button class="h-9 w-full rounded-lg bg-primary px-3 text-sm font-medium text-white hover:opacity-90" data-testid="create-public-link">Create link</button>
						</form>
					{/if}
				</Menu>
			{/if}
		</nav>
	{/snippet}
</HangarBoard>
