<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Badge, Button, Icon, Input, cn } from '#lib/ui/index.ts';
	import SignWaiver from '#lib/components/waivers/SignWaiver.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Signing instants shown as calendar days in the DZ's timezone (server render and the
	// hydrated page agree, whatever the server's or the viewer's clock).
	const fmt = (d: Date | string) =>
		new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: data.timezone });
	// "Sign again" is a link (?again=1): works before hydration and without JS, and Back / Cancel
	// return to the "You're covered" view.
	const resign = $derived(page.url.searchParams.has('again'));
	const showForm = $derived(data.dz.active && data.sections.length > 0 && (!data.status?.valid || resign));
	const myName = () => data.me.name;
	let signerName = $state(myName());
</script>

<svelte:head><title>Waiver · {data.dz.name}</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-5">
	<div>
		<p class="text-xs font-medium tracking-wider text-primary uppercase">{data.dz.name}</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight">Skydiver waiver</h1>
		<p class="mt-1 text-sm text-muted">Sign once a year to jump at {data.dz.name}. A PDF copy is kept for you and the dropzone.</p>
	</div>

	{#if data.status}
		<div
			class={cn('flex items-center gap-3 rounded-2xl border p-4', data.status.valid ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5')}
			data-testid="waiver-status"
		>
			<span class={cn('grid size-10 shrink-0 place-items-center rounded-xl', data.status.valid ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>
				<Icon name={data.status.valid ? 'check' : 'waiver'} />
			</span>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">{data.status.valid ? 'You’re covered' : 'Your waiver has expired'}</p>
				<p class="text-sm text-muted">
					Signed {fmt(data.status.signedAt)} · {data.status.valid ? 'valid until' : 'expired'} {fmt(data.status.expiresAt)}
				</p>
			</div>
			<Button size="sm" variant="secondary" href="/app/waivers/signed/{data.status.id}/pdf" target="_blank" rel="noopener"><Icon name="waiver" class="size-4" /> PDF</Button>
		</div>
		{#if data.status.valid && !resign}
			<div class="flex flex-wrap items-center gap-2">
				<Button href="/app/check-in?dz={data.dz.slug}" data-testid="waiver-next"><Icon name="checkin" class="size-4" /> Check in &amp; join a load</Button>
				{#if data.dz.active && data.sections.length > 0}
					<Button variant="ghost" size="sm" href="?again=1" data-sveltekit-reset="false" data-testid="sign-again">Sign again</Button>
				{/if}
			</div>
		{:else if data.status.valid && showForm}
			<p class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
				Your current waiver stays valid until you sign the new one.
				<a href={page.url.pathname} class="font-medium text-primary underline underline-offset-2" data-testid="sign-again-cancel">Cancel</a>
			</p>
		{/if}
	{/if}

	{#if !data.dz.active || data.sections.length === 0}
		<div class="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
			<p class="font-medium">No online waiver at {data.dz.name}</p>
			<p class="mt-1 text-sm text-muted">This dropzone doesn’t use an in-app waiver right now — they’ll handle it at manifest.</p>
		</div>
	{:else if showForm}
		<SignWaiver
			action="?/sign"
			sections={data.sections}
			dropzoneName={data.dz.name}
			{signerName}
			title="Skydiver Indemnity & Waiver"
			errorSection={(form as { section?: number | null } | null)?.section ?? null}
			submitLabel="Sign and save PDF"
			onSigned={() => {
				// Back to the "You're covered" view (the enhanced post stays on ?again=1).
				if (resign) void goto(page.url.pathname, { replace: true, reset: false });
			}}
		>
			{#snippet header()}
				<div class="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2">
					<Input label="Full name" name="signer_name" bind:value={signerName} required autocomplete="name" />
					<Input label="Email" value={data.me.email} disabled />
					<p class="text-xs text-muted sm:col-span-2">
						Your licence, association number and emergency contact from your <a href="/app/profile" class="text-primary underline underline-offset-2">profile</a> are added to the PDF.
					</p>
				</div>
			{/snippet}
		</SignWaiver>
	{/if}

	{#if data.history.length > 1}
		<section>
			<h2 class="mb-2 text-xs font-semibold tracking-wider text-subtle uppercase">Previous waivers</h2>
			<ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
				{#each data.history.slice(1) as h (h.id)}
					<li class="flex items-center justify-between px-4 py-2.5 text-sm">
						<span>{fmt(h.signedAt)} <Badge tone={h.valid ? 'success' : 'neutral'} class="ml-1">{h.valid ? 'Valid' : 'Expired'}</Badge></span>
						<a href="/app/waivers/signed/{h.id}/pdf" target="_blank" rel="noopener" class="text-primary hover:underline">PDF</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
