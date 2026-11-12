<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Card, EmptyState } from '#lib/ui/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Glyph from '#lib/components/import/Glyph.svelte';
	import { brand } from '#lib/brand.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state('');
	const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'not yet');
	const submit = (name: string) => () => {
		busy = name;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = '';
		};
	};
</script>

<svelte:head><title>Linked accounts</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Linked accounts</h1>
	<p class="mt-1 text-muted">
		{#if data.mode === 'global'}
			Dropzones running their own {brand.name} server that you've allowed to add jumps to your logbook.
		{:else}
			Link your global {brand.name} account and every load you complete here also lands in your global logbook.
		{/if}
	</p>

	{#if form && 'done' in form && form.done}
		<p class="mt-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success" role="status">{form.done}</p>
	{/if}
	{#if form && 'message' in form && form.message}
		<p class="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{form.message}</p>
	{/if}

	{#if data.mode === 'global'}
		{#if data.grants.length}
			<div class="mt-6 space-y-3" data-testid="grants">
				{#each data.grants as g (g.grantId)}
					<Card>
						<div class="flex flex-wrap items-center gap-4">
							<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name="server" class="size-5" /></span>
							<div class="min-w-0 flex-1">
								<p class="font-semibold">{g.name}</p>
								<p class="truncate text-sm text-muted">{g.origin}</p>
								<p class="mt-1 text-xs text-subtle">
									Linked {fmt(g.linkedAt)} · last sync {fmt(g.lastSyncAt)} ·
									<span class="text-fg" data-testid="grant-jumps">{g.jumps}</span>
									{g.jumps === 1 ? 'jump' : 'jumps'} synced
								</p>
							</div>
							<form method="POST" action="?/revoke" use:enhance={submit(g.grantId)}>
								<input type="hidden" name="grant" value={g.grantId} />
								<Button type="submit" variant="secondary" size="sm" loading={busy === g.grantId}><Glyph name="unlink" class="size-4" /> Unlink</Button>
							</form>
						</div>
					</Card>
				{/each}
			</div>
		{:else}
			<EmptyState
				class="mt-6"
				title="No linked dropzones"
				description="When a dropzone with its own server asks to link your account, it shows up here."
			/>
		{/if}
	{:else}
		{#if data.flash === 'linked'}
			<p class="mt-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success" role="status" data-testid="link-success">
				Linked! Your jumps here will sync to your global logbook.
			</p>
		{/if}
		{#if data.error}
			<p class="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{data.error}</p>
		{/if}

		<Card class="relative mt-6 overflow-hidden">
			<div class="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-primary/10 blur-3xl" aria-hidden="true"></div>
			<div class="relative flex flex-col gap-5 sm:flex-row sm:items-center">
				<span
					class="grid size-14 shrink-0 place-items-center rounded-2xl {data.link ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'}"
				>
					<Icon name="globe" class="size-7" />
				</span>
				<div class="min-w-0 flex-1">
					{#if data.link}
						<div class="flex items-center gap-2">
							<p class="font-semibold">Global account linked</p>
							<Badge tone="success" dot>active</Badge>
						</div>
						<p class="mt-0.5 truncate text-sm text-muted">{data.link.issuer}</p>
						<p class="mt-1 text-xs text-subtle" data-testid="link-status">
							Linked {fmt(data.link.linkedAt)} · last sync {fmt(data.link.lastSyncAt)}{data.pending ? ` · ${data.pending} waiting` : ''}
						</p>
					{:else if data.available}
						<p class="font-semibold">Link global account</p>
						<p class="mt-0.5 text-sm text-muted">You'll sign in on {data.globalUrl ? new URL(data.globalUrl).host : 'the global site'} and approve the link.</p>
					{:else}
						<p class="font-semibold">Not available yet</p>
						<p class="mt-0.5 text-sm text-muted">This dropzone hasn't connected its server to the global {brand.name} instance.</p>
					{/if}
				</div>
				{#if data.link}
					<form method="POST" action="?/unlink" use:enhance={submit('unlink')}>
						<Button type="submit" variant="secondary" loading={busy === 'unlink'}><Glyph name="unlink" class="size-4" /> Unlink</Button>
					</form>
				{:else if data.available}
					<form method="POST" action="?/link">
						<Button type="submit" data-testid="link-global"><Glyph name="link" class="size-4" /> Link global account</Button>
					</form>
				{/if}
			</div>
		</Card>
		<ul class="mt-6 grid gap-3 text-sm text-muted sm:grid-cols-3">
			<li class="rounded-xl border border-border p-4"><span class="font-medium text-fg">One logbook.</span> Jumps from every dropzone in one place.</li>
			<li class="rounded-xl border border-border p-4"><span class="font-medium text-fg">Verified.</span> Synced jumps are marked with this dropzone.</li>
			<li class="rounded-xl border border-border p-4"><span class="font-medium text-fg">Your call.</span> Unlink here or on the global site any time.</li>
		</ul>
	{/if}
</div>
