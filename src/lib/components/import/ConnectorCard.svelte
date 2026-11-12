<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { Button, Card, Input } from '#lib/ui/index.ts';
	import { ConnectorError, JumpMasterConnector } from '#lib/import/jumpmaster/client.ts';
	import { mapJumpMasterDocs } from '#lib/import/jumpmaster/map.ts';
	import type { JmDoc } from '#lib/import/jumpmaster/values.ts';
	import Glyph from './Glyph.svelte';

	type Config = { projectId: string; apiKey: string; authBaseUrl?: string; firestoreBaseUrl?: string };
	let {
		mode,
		config,
		timezone = null,
		currency = null
	}: { mode: 'jumper' | 'dropzone'; config: Config | null; timezone?: string | null; currency?: string | null } = $props();

	let ready = $state(false);
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let step = $state('');
	let fetched = $state(0);
	let message = $state<string | null>(null);
	let owned = $state<JmDoc[]>([]);
	let chosen = $state('');
	let connector: JumpMasterConnector | null = null;

	onMount(() => (ready = true));

	const progress = (s: string, d?: { count?: number }) => {
		step = s;
		if (d?.count) fetched += d.count;
	};

	async function submitBundle(docs: Awaited<ReturnType<JumpMasterConnector['fetchJumper']>>) {
		step = 'Converting';
		const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
		const { bundle, warnings } = mapJumpMasterDocs(docs, { timezone: tz, currency: currency ?? undefined });
		step = 'Uploading to preview';
		const fd = new FormData();
		fd.set('source', 'jumpmaster');
		fd.set('warnings', JSON.stringify(warnings.slice(0, 200)));
		fd.set('file', new File([JSON.stringify(bundle)], 'jumpmaster.json', { type: 'application/json' }));
		const res = await fetch('?/upload', { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true', accept: 'application/json' } });
		const result = deserialize(await res.text());
		if (result.type === 'redirect') await goto(result.location, { invalidateAll: true });
		else if (result.type === 'failure') message = String((result.data as { message?: string })?.message ?? 'Upload failed.');
		else if (result.type === 'error') message = result.error?.message ?? 'Upload failed.';
	}

	async function connect(e: SubmitEvent) {
		e.preventDefault();
		if (!config) return;
		message = null;
		busy = true;
		fetched = 0;
		try {
			connector = new JumpMasterConnector(config);
			step = 'Signing in to Jump Master';
			await connector.signIn(email.trim(), password);
			password = '';
			if (mode === 'jumper') {
				await submitBundle(await connector.fetchJumper(progress));
			} else {
				step = 'Finding your dropzones';
				owned = await connector.findOwnedDropzones();
				if (!owned.length) throw new ConnectorError("This Jump Master account doesn't own a dropzone.", 'not_found');
				if (owned.length === 1) await fetchDz(owned[0].id);
				else chosen = owned[0].id;
			}
		} catch (err) {
			message = err instanceof ConnectorError ? err.message : 'Something went wrong talking to Jump Master.';
			connector?.signOut();
		} finally {
			password = '';
			busy = false;
		}
	}

	async function fetchDz(id: string) {
		if (!connector) return;
		busy = true;
		message = null;
		try {
			await submitBundle(await connector.fetchDropzone(id, progress));
		} catch (err) {
			message = err instanceof ConnectorError ? err.message : 'Something went wrong talking to Jump Master.';
		} finally {
			connector.signOut();
			owned = [];
			busy = false;
		}
	}
</script>

<Card class="flex flex-col" data-testid="connector-card">
	<div class="flex items-start gap-3">
		<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Glyph name="link" /></span>
		<div class="min-w-0">
			<h2 class="font-semibold">Connect Jump Master account</h2>
			<p class="mt-0.5 text-sm text-muted">
				{mode === 'jumper'
					? 'Sign in with your Jump Master login and we copy your logbook, gear and profile.'
					: 'Sign in as the dropzone owner to copy aircraft, prices, staff, loads and jumpers.'}
			</p>
		</div>
	</div>

	{#if !config}
		<div class="mt-5 flex flex-1 flex-col justify-center rounded-2xl border border-border bg-surface-2/40 p-5 text-sm" data-testid="connector-unavailable">
			<p class="font-medium">The connector isn't available on this server.</p>
			<p class="mt-1 text-muted">
				Export your data from Jump Master, or use a {mode === 'jumper' ? 'CSV logbook' : 'data file'}, and upload it instead.
			</p>
		</div>
	{:else if owned.length > 1}
		<div class="mt-5 flex flex-1 flex-col gap-4">
			<label class="flex flex-col gap-1.5 text-sm font-medium">
				Which dropzone?
				<select bind:value={chosen} class="h-11 rounded-xl border border-border bg-surface px-3 text-[15px] text-fg">
					{#each owned as d (d.id)}<option value={d.id}>{String(d.name ?? d.id)}</option>{/each}
				</select>
			</label>
			<div class="mt-auto flex justify-end gap-2">
				<Button variant="ghost" onclick={() => ((owned = []), connector?.signOut())}>Cancel</Button>
				<Button loading={busy} onclick={() => fetchDz(chosen)}>Fetch dropzone</Button>
			</div>
		</div>
	{:else}
		<form class="mt-5 flex flex-1 flex-col gap-3" onsubmit={connect} autocomplete="off">
			<!-- No name attributes: these values never leave the browser except to Jump Master's sign-in endpoint. -->
			<Input label="Jump Master email" type="email" bind:value={email} required autocomplete="username" data-testid="jm-email" />
			<Input label="Jump Master password" type="password" bind:value={password} required autocomplete="current-password" data-testid="jm-password" />
			<p class="flex items-start gap-2 text-xs text-muted">
				<Glyph name="lock" class="mt-px size-3.5 shrink-0" />
				Your password goes straight from this browser to Jump Master. It is never sent to or stored by us.
			</p>
			{#if busy && step}
				<p class="text-sm text-primary" aria-live="polite">{step}…{fetched ? ` ${fetched} records` : ''}</p>
			{/if}
			{#if message}
				<p class="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{message}</p>
			{/if}
			<div class="mt-auto flex justify-end pt-1">
				<Button type="submit" loading={busy} disabled={!ready} data-testid="jm-connect">Connect and preview</Button>
			</div>
		</form>
	{/if}
</Card>
