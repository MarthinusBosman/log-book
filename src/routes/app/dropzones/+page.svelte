<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Badge, Button, EmptyState, cn, toast } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { openToday } from '#lib/components/jumper/hours.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let locating = $state(false);

	function nearMe() {
		if (!('geolocation' in navigator)) return toast.error('Location isn’t available in this browser');
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locating = false;
				const u = new URL(page.url.href);
				u.searchParams.set('lat', p.coords.latitude.toFixed(4));
				u.searchParams.set('lng', p.coords.longitude.toFixed(4));
				goto(u.pathname + u.search);
			},
			() => {
				locating = false;
				toast.error('Couldn’t get your location');
			},
			{ timeout: 10_000, maximumAge: 600_000 }
		);
	}
	const clearNear = () => {
		const u = new URL(page.url.href);
		u.searchParams.delete('lat');
		u.searchParams.delete('lng');
		goto(u.pathname + u.search);
	};
	const quiet = () => async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
		await update();
		const msg = (result.data as { success?: string } | undefined)?.success;
		if (result.type === 'success' && msg) toast.success(msg);
	};
</script>

<svelte:head><title>Dropzones</title></svelte:head>

<PageHeader title="Dropzones" icon="globe" description="Find a dropzone, follow your favourites and check in." />

<form method="GET" class="mb-6 flex flex-col gap-2 sm:flex-row" data-sveltekit-keepfocus data-sveltekit-reset="false">
	<label class="relative flex-1">
		<span class="sr-only">Search</span>
		<JIcon name="search" class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
		<input
			type="search"
			name="q"
			value={data.q}
			placeholder="Search for dropzones…"
			class="h-11 w-full rounded-xl border border-border bg-surface pr-3.5 pl-10 text-[15px] outline-none placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15"
			data-testid="dz-search"
		/>
	</label>
	{#if page.url.searchParams.has('lat')}
		<input type="hidden" name="lat" value={page.url.searchParams.get('lat')} />
		<input type="hidden" name="lng" value={page.url.searchParams.get('lng')} />
	{/if}
	<div class="flex gap-2">
		<Button type="submit" variant="secondary" class="flex-1 sm:flex-none">Search</Button>
		{#if data.nearMe}
			<Button variant="outline" onclick={clearNear} class="flex-1 sm:flex-none"><JIcon name="x" class="size-4" /> Near me</Button>
		{:else}
			<Button variant="outline" onclick={nearMe} loading={locating} class="flex-1 sm:flex-none" data-testid="near-me"><JIcon name="locate" class="size-4" /> Near me</Button>
		{/if}
	</div>
</form>

{#if data.dropzones.length === 0}
	<EmptyState title={data.q ? `No dropzones match “${data.q}”` : 'No dropzones listed yet'} description="Try a different name or town.">
		{#snippet icon()}<JIcon name="mapPin" class="size-6" />{/snippet}
	</EmptyState>
{:else}
	<ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="dz-list">
		{#each data.dropzones as dz (dz.id)}
			{@const open = openToday(dz)}
			<li class="group relative flex flex-col rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
				<div class="flex items-start gap-3">
					<span class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-linear-to-br from-primary/25 to-primary/5 text-lg font-semibold text-primary">
						{#if dz.photo}
							<img src={dz.photo} alt="" width="48" height="48" class="size-full object-cover" loading="lazy" decoding="async" />
						{:else}
							{dz.name.slice(0, 1)}
						{/if}
					</span>
					<div class="min-w-0 flex-1">
						<a href="/app/dropzones/{dz.slug}" class="block truncate font-semibold tracking-tight after:absolute after:inset-0">{dz.name}</a>
						<p class="truncate text-sm text-muted">{dz.address ?? 'Address not set'}</p>
					</div>
					<form method="POST" action="?/favourite" use:enhance={quiet} class="relative z-10">
						<input type="hidden" name="dropzoneId" value={dz.id} />
						<input type="hidden" name="favourite" value={String(!dz.favourite)} />
						<button
							type="submit"
							class={cn('grid size-9 place-items-center rounded-lg transition-colors hover:bg-surface-2', dz.favourite ? 'text-warning' : 'text-subtle hover:text-fg')}
							aria-label={dz.favourite ? 'Remove from favourites' : 'Add to favourites'}
							aria-pressed={dz.favourite}
						>
							<svg viewBox="0 0 24 24" class="size-5" fill={dz.favourite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
						</button>
					</form>
				</div>
				<div class="mt-3 flex flex-wrap items-center gap-1.5">
					{#if dz.checkedIn}<Badge tone="success" dot>Checked in</Badge>{/if}
					{#if open}<Badge tone={open.tone}>{open.label}</Badge>{/if}
					{#if dz.member}<Badge tone="brand">Member</Badge>{:else if dz.following}<Badge>Following</Badge>{/if}
					{#if dz.distanceKm !== null}<Badge><JIcon name="mapPin" class="size-3" /> {dz.distanceKm < 10 ? dz.distanceKm : Math.round(dz.distanceKm)} km away</Badge>{/if}
				</div>
				{#if dz.description}<p class="mt-3 line-clamp-2 text-sm text-muted">{dz.description}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}
