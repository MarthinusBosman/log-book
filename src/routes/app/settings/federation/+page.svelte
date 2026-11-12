<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Card, Input } from '#lib/ui/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Glyph from '#lib/components/import/Glyph.svelte';
	import CopyField from '#lib/components/import/CopyField.svelte';
	import { brand } from '#lib/brand.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state('');
	const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
	const submit = (name: string) => () => {
		busy = name;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = '';
		};
	};
	const tone = { active: 'success', suspended: 'warning', revoked: 'danger' } as const;
</script>

<svelte:head><title>Federation</title></svelte:head>

<div class="mx-auto max-w-5xl">
	<header>
		<div class="flex items-center gap-2">
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Federation</h1>
			<Badge tone="brand">{data.mode === 'global' ? 'Global instance' : 'Dropzone instance'}</Badge>
		</div>
		<p class="mt-1 max-w-2xl text-muted">
			{#if data.mode === 'global'}
				Self-hosted dropzone instances register here. Their jumpers link to their {brand.name} account and completed loads land in their
				global logbook automatically.
			{:else}
				Connect this server to the global {brand.name} instance so jumpers can link their global account and have their jumps here synced to
				it.
			{/if}
		</p>
	</header>

	{#if form && 'message' in form && form.message}
		<p class="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{form.message}</p>
	{/if}
	{#if form && 'done' in form && form.done}
		<p class="mt-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success" role="status" data-testid="fed-done">{form.done}</p>
	{/if}

	{#if data.mode === 'global'}
		{#if form && 'created' in form && form.created}
			<Card class="mt-6 border-primary/40" data-testid="fed-credentials">
				<div class="flex items-start gap-3">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Glyph name="key" /></span>
					<div class="min-w-0 flex-1">
						<h2 class="font-semibold">Credentials for {form.created.name}</h2>
						<p class="mt-0.5 text-sm text-muted">
							Put these in the dropzone server's environment (or its Settings → Federation). The secret is shown <strong>once</strong>.
						</p>
						<div class="mt-4 grid gap-3">
							<CopyField label="FEDERATION_GLOBAL_URL" value={form.created.globalUrl} testid="cred-url" />
							<CopyField label="FEDERATION_CLIENT_ID" value={form.created.clientId} testid="cred-id" />
							<CopyField label="FEDERATION_CLIENT_SECRET" value={form.created.clientSecret} secret testid="cred-secret" />
						</div>
					</div>
				</div>
			</Card>
		{/if}

		<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
			<Card title="Register an instance" description="One per self-hosted dropzone server.">
				<form method="POST" action="?/register" class="flex flex-col gap-4" use:enhance={submit('register')}>
					<Input label="Name" name="name" required placeholder="Skydive Robertson (self-hosted)" value={form && 'name' in form ? form.name : ''} />
					<Input label="Instance URL" name="origin" type="url" required placeholder="https://manifest.skydive-robertson.co.za" value={form && 'origin' in form ? form.origin : ''} />
					<Input
						label="Redirect URI"
						name="redirectUri"
						type="url"
						placeholder="defaults to <URL>/app/settings/linked-accounts/callback"
						hint="Leave blank unless the dropzone runs behind a different path."
						value={form && 'redirectUri' in form ? form.redirectUri : ''}
					/>
					<div class="flex justify-end">
						<Button type="submit" loading={busy === 'register'} data-testid="fed-register">Register</Button>
					</div>
				</form>
			</Card>

			<Card padded={false}>
				<div class="flex items-center justify-between border-b border-border px-5 py-3.5">
					<h2 class="text-sm font-semibold">Registered instances</h2>
					<span class="text-xs text-muted">{data.instances.length}</span>
				</div>
				{#if data.instances.length}
					<ul class="divide-y divide-border" data-testid="fed-instances">
						{#each data.instances as i (i.id)}
							<li class="px-5 py-4">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-medium">{i.name}</span>
									<Badge tone={tone[i.status]} dot>{i.status}</Badge>
									<span class="ml-auto text-xs text-muted">{i.linkedUsers} linked {i.linkedUsers === 1 ? 'jumper' : 'jumpers'}</span>
								</div>
								<p class="mt-1 truncate text-sm text-muted">{i.origin}</p>
								<p class="mt-0.5 truncate font-mono text-xs text-subtle">{i.clientId}</p>
								<div class="mt-3 flex flex-wrap gap-2">
									<form method="POST" action="?/rotate" use:enhance={submit('rotate' + i.id)}>
										<input type="hidden" name="id" value={i.id} />
										<Button type="submit" size="sm" variant="secondary" loading={busy === 'rotate' + i.id}>New secret</Button>
									</form>
									{#if i.status !== 'revoked'}
										<form method="POST" action="?/status" use:enhance={submit('s' + i.id)}>
											<input type="hidden" name="id" value={i.id} />
											<input type="hidden" name="status" value={i.status === 'active' ? 'suspended' : 'active'} />
											<Button type="submit" size="sm" variant="ghost">{i.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>
										</form>
										<form method="POST" action="?/status" use:enhance={submit('r' + i.id)}>
											<input type="hidden" name="id" value={i.id} />
											<input type="hidden" name="status" value="revoked" />
											<Button type="submit" size="sm" variant="ghost" class="!text-danger">Revoke</Button>
										</form>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="px-5 py-8 text-center text-sm text-muted">No instances registered yet.</p>
				{/if}
			</Card>
		</div>
	{:else}
		<div class="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
			<Card>
				<div class="flex items-start gap-3">
					<span
						class="grid size-10 shrink-0 place-items-center rounded-xl {data.config ? 'bg-success/10 text-success' : 'bg-surface-2 text-subtle'}"
						><Icon name="globe" class="size-5" /></span
					>
					<div class="min-w-0 flex-1">
						<h2 class="font-semibold">{data.config ? 'Connected to global' : 'Not connected'}</h2>
						<p class="mt-0.5 text-sm text-muted">
							{#if data.config}
								{data.config.globalUrl} · client <span class="font-mono text-xs">{data.config.clientId}</span>
								{#if data.config.source === 'env'}<Badge class="ml-1">env</Badge>{/if}
							{:else}
								Ask the global instance to register this server, then enter the credentials below.
							{/if}
						</p>
					</div>
				</div>

				<div class="mt-5 rounded-xl border border-border bg-surface-2/40 p-4 text-sm">
					<p class="font-medium">Register this server on the global instance with</p>
					<div class="mt-3 grid gap-2">
						<CopyField label="Instance URL" value={data.origin} />
						<CopyField label="Redirect URI" value={data.redirectUri} />
					</div>
				</div>

				{#if data.config?.source === 'env'}
					<p class="mt-5 text-sm text-muted">Configured by <code class="text-xs">FEDERATION_*</code> environment variables. Change them on the server.</p>
					<form method="POST" action="?/test" class="mt-4" use:enhance={submit('test')}>
						<Button type="submit" variant="secondary" loading={busy === 'test'}>Test connection</Button>
					</form>
				{:else}
					<form method="POST" action="?/save" class="mt-5 flex flex-col gap-4" use:enhance={submit('save')}>
						<Input
							label="Global instance URL"
							name="globalUrl"
							type="url"
							required
							placeholder="https://log-book.app"
							value={(form && 'globalUrl' in form ? form.globalUrl : data.config?.globalUrl) ?? ''}
						/>
						<Input
							label="Client ID"
							name="clientId"
							required
							placeholder="dzc_…"
							value={(form && 'clientId' in form ? form.clientId : data.config?.clientId) ?? ''}
						/>
						<Input
							label="Client secret"
							name="clientSecret"
							type="password"
							autocomplete="off"
							placeholder={data.config ? `${data.config.secretHint} (unchanged)` : 'dzs_…'}
							required={!data.config}
						/>
						<div class="flex flex-wrap justify-end gap-2">
							{#if data.config}
								<Button type="submit" formaction="?/clear" variant="ghost" class="!text-danger" formnovalidate>Disconnect</Button>
								<Button type="submit" formaction="?/test" variant="secondary" formnovalidate loading={busy === 'test'}>Test</Button>
							{/if}
							<Button type="submit" loading={busy === 'save'} data-testid="fed-save">Save</Button>
						</div>
					</form>
				{/if}
			</Card>

			<div class="flex flex-col gap-6">
				<Card title="Logbook sync" description="Jumps of linked jumpers are pushed when a load is completed.">
					<dl class="grid grid-cols-3 gap-3 text-center">
						<div class="rounded-xl bg-surface-2/50 py-3">
							<dt class="text-xs text-muted">Linked</dt>
							<dd class="text-xl font-semibold tabular-nums">{data.linkedUsers}</dd>
						</div>
						<div class="rounded-xl bg-surface-2/50 py-3">
							<dt class="text-xs text-muted">Waiting</dt>
							<dd class="text-xl font-semibold tabular-nums {data.stats.failing ? 'text-warning' : ''}" data-testid="fed-pending">{data.stats.pending}</dd>
						</div>
						<div class="rounded-xl bg-surface-2/50 py-3">
							<dt class="text-xs text-muted">Synced</dt>
							<dd class="text-xl font-semibold tabular-nums" data-testid="fed-sent">{data.stats.sent}</dd>
						</div>
					</dl>
					{#if data.stats.lastError}
						<p class="mt-3 flex items-start gap-2 text-sm text-warning"><Glyph name="alert" class="mt-0.5 size-4 shrink-0" />{data.stats.lastError} — retrying with backoff.</p>
					{/if}
					<form method="POST" action="?/flush" class="mt-4 flex justify-end" use:enhance={submit('flush')}>
						<Button type="submit" variant="secondary" size="sm" disabled={!data.config} loading={busy === 'flush'} data-testid="fed-flush">
							<Glyph name="sync" class="size-4" /> Sync now
						</Button>
					</form>
				</Card>
				<Card>
					<p class="text-sm font-medium">Scheduled sync</p>
					<p class="mt-1 text-sm text-muted">
						Call <code class="text-xs">POST /api/federation/flush</code> from cron with
						<code class="text-xs">Authorization: Bearer $FEDERATION_FLUSH_SECRET</code> and <code class="text-xs">Content-Type: application/json</code>.
					</p>
				</Card>
			</div>
		</div>
	{/if}
</div>
