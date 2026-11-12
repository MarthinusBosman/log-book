<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { Avatar, Badge, Button, Card, Icon, Input, Select, cn, toast } from '#lib/ui/index.ts';
	import { JUMP_TYPE_LABELS, formatMoney } from '#lib/domain/constants.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(data.team);
	const f = $derived(form as { action?: string; message?: string } | null);
	// svelte-ignore state_referenced_locally
	let colour = $state(data.team.colour ?? '#3b82f6');
	// svelte-ignore state_referenced_locally
	let selected = $state<string[]>(data.team.members.map((m) => m.id));
	let jumpType = $state('belly');
	let loadId = $state('');
	let busy = $state<string | null>(null);
	let manifestMsg = $state<{ tone: 'error' | 'success'; text: string } | null>(null);
	const perJumper = $derived(data.manifest?.prices[jumpType as keyof typeof data.manifest.prices] ?? 0);

	onMount(() => {
		if (data.created) {
			toast.success('Team created. Add your teammates.');
			history.replaceState(history.state, '', location.pathname);
		}
	});
	const quiet = (name = 'x') => () => {
		busy = name;
		return async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
			await update();
			busy = null;
			const d = result.data as { success?: string; message?: string } | undefined;
			if (result.type === 'success' && d?.success) toast.success(d.success);
		};
	};
</script>

<svelte:head><title>{t.name}</title></svelte:head>

<PageHeader title={t.name} description="{t.discipline ?? 'Team'} · {t.members.length} {t.members.length === 1 ? 'member' : 'members'}" back={{ href: '/app/team', label: 'Teams' }}>
	{#snippet actions()}
		<span class="size-3 rounded-full" style="background: {t.colour ?? 'var(--color-border-strong)'}"></span>
		{#if t.dz}<Badge>Dropzone team</Badge>{:else if data.isOwner}<Badge tone="brand">Owner</Badge>{/if}
	{/snippet}
</PageHeader>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
	<div class="space-y-4 lg:col-span-3">
		<!-- manifest the team -->
		<Card title="Manifest the team" description={data.manifest ? `Open loads at ${data.manifest.dropzone.name}` : undefined}>
			{#if !data.manifest}
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p class="text-sm text-muted">Check in at your dropzone to put the whole team on a load.</p>
					<Button href="/app/check-in" variant="secondary"><Icon name="checkin" class="size-4" /> Check in</Button>
				</div>
			{:else if data.manifest.loads.length === 0}
				<p class="text-sm text-muted">No loads are open for self-manifest right now.</p>
			{:else}
				<form
					method="POST"
					action="/app/check-in?/team"
					class="space-y-4"
					data-testid="manifest-team"
					use:enhance={() => {
						busy = 'manifest';
						manifestMsg = null;
						return async ({ result }) => {
							busy = null;
							const d = (result as { data?: { success?: string; message?: string } }).data;
							if (result.type === 'success') {
								manifestMsg = { tone: 'success', text: d?.success ?? 'Team joined load successfully' };
								toast.success(manifestMsg.text);
							} else manifestMsg = { tone: 'error', text: d?.message ?? 'Couldn’t manifest the team' };
						};
					}}
				>
					<input type="hidden" name="teamId" value={t.id} />
					<fieldset class="min-w-0">
						<legend class="mb-2 text-sm font-medium">Load</legend>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{#each data.manifest.loads as l (l.id)}
								<label class="cursor-pointer">
									<input type="radio" name="loadId" value={l.id} bind:group={loadId} required class="peer sr-only" disabled={l.free < selected.length} />
									<span class="flex flex-col rounded-xl border border-border px-3 py-2.5 transition-colors peer-checked:border-primary/50 peer-checked:bg-primary/10 peer-disabled:opacity-50 hover:border-border-strong">
										<span class="font-semibold">Load {l.loadNumber}</span>
										<span class="text-xs text-muted">{l.free} slot{l.free === 1 ? '' : 's'} left{l.aircraftName ? ` · ${l.aircraftName}` : ''}</span>
									</span>
								</label>
							{/each}
						</div>
					</fieldset>
					<Select label="Jump type" name="jumpType" bind:value={jumpType} options={data.jumpTypes.map((j) => ({ value: j, label: JUMP_TYPE_LABELS[j] }))} />
					<fieldset class="min-w-0">
						<legend class="mb-2 text-sm font-medium">Who’s jumping</legend>
						<div class="flex flex-wrap gap-1.5">
							{#each t.members as m (m.id)}
								<label class="cursor-pointer">
									<input type="checkbox" name="memberIds" value={m.id} bind:group={selected} class="peer sr-only" />
									<span class="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-2.5 text-sm text-muted peer-checked:border-primary/50 peer-checked:bg-primary/10 peer-checked:text-fg">
										<Avatar name={m.name} src={m.avatar} size="sm" class="size-5 text-[9px]" />{m.me ? 'Me' : m.name}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>
					{#if t.coachUserId || t.videoUserId}
						<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="includeStaff" value="on" checked class="size-4 accent-[var(--dz-primary)]" /> Include the team’s coach / video</label>
					{/if}
					{#if manifestMsg}<FormAlert tone={manifestMsg.tone} message={manifestMsg.text} />{/if}
					<div class="flex flex-col gap-2 rounded-xl bg-surface-2/60 p-3 sm:flex-row sm:items-center sm:justify-between">
						<p class="text-sm text-muted">{selected.length} × <span class="font-medium text-fg tabular-nums">{formatMoney(perJumper, data.manifest.dropzone.currency)}</span> per jumper</p>
						<Button type="submit" loading={busy === 'manifest'} disabled={!selected.length}><Icon name="plane" class="size-4" /> Join load now</Button>
					</div>
				</form>
			{/if}
		</Card>

		<Card title="Members" padded={false}>
			<ul class="divide-y divide-border" data-testid="team-members">
				{#each t.members as m (m.id)}
					<li class="flex items-center gap-3 px-5 py-3">
						<Avatar name={m.name} src={m.avatar} size="sm" />
						<span class="min-w-0 flex-1 text-sm">
							<span class="block truncate font-medium">{m.name}{m.me ? ' (you)' : ''}</span>
							<span class="text-xs text-muted">{[m.licence, m.id === t.coachUserId ? 'Coach' : null, m.id === t.videoUserId ? 'Video' : null].filter(Boolean).join(' · ') || 'Jumper'}</span>
						</span>
						{#if data.canEdit && !m.me}
							<form method="POST" action="?/remove" use:enhance={(e) => { if (!confirm(`Remove ${m.name} from the team?`)) return e.cancel(); return quiet()(); }}>
								<input type="hidden" name="userId" value={m.id} />
								<button type="submit" class="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger" aria-label="Remove {m.name}"><JIcon name="x" class="size-4" /></button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
			{#if data.canEdit}
				<div class="border-t border-border p-4">
					{#if data.buddies.length}
						<p class="mb-2 text-xs font-medium tracking-wider text-muted uppercase">Add a buddy</p>
						<div class="mb-4 flex flex-wrap gap-1.5">
							{#each data.buddies as b (b.id)}
								<form method="POST" action="?/add" use:enhance={quiet()}>
									<input type="hidden" name="userId" value={b.id} />
									<button type="submit" class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2.5 text-sm text-muted hover:border-primary/50 hover:text-fg"><Icon name="plus" class="size-3.5" />{b.name}</button>
								</form>
							{/each}
						</div>
					{/if}
					<form method="GET" class="flex gap-2">
						<label class="relative flex-1">
							<span class="sr-only">Search jumpers</span>
							<JIcon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
							<input type="search" name="q" value={data.q} placeholder="Search jumper’s name…" class="h-10 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-sm outline-none hover:border-border-strong focus:border-primary" />
						</label>
						<Button type="submit" variant="secondary">Find</Button>
					</form>
					{#if data.q}
						<ul class="mt-2 divide-y divide-border rounded-xl border border-border" data-testid="member-results">
							{#each data.results as u (u.id)}
								<li class="flex items-center gap-3 px-3 py-2">
									<Avatar name={u.name} src={u.avatar} size="sm" />
									<span class="min-w-0 flex-1 truncate text-sm font-medium">{u.name}</span>
									<form method="POST" action="?/add" use:enhance={quiet()}>
										<input type="hidden" name="userId" value={u.id} />
										<Button type="submit" size="sm" variant="secondary">Add to team</Button>
									</form>
								</li>
							{:else}
								<li class="px-3 py-2.5 text-sm text-muted">{data.q.length < 2 ? 'Type at least 2 letters.' : 'Nobody found.'}</li>
							{/each}
						</ul>
					{/if}
					<FormAlert class="mt-3" message={f?.action === 'add' || f?.action === 'remove' ? f.message : null} />
				</div>
			{/if}
		</Card>
	</div>

	<aside class="space-y-4 lg:col-span-2">
		{#if data.canEdit}
			<Card title="Team settings">
				<form method="POST" action="?/update" class="space-y-4" use:enhance={quiet('update')} data-testid="team-settings">
					<Input label="Name" name="name" value={t.name} required />
					<Select label="Discipline" name="discipline" value={t.discipline ?? ''} options={[{ value: '', label: 'Not set' }, ...data.disciplines.map((d) => ({ value: d, label: d })), ...(t.discipline && !data.disciplines.includes(t.discipline as never) ? [{ value: t.discipline, label: t.discipline }] : [])]} />
					<div class="grid grid-cols-2 gap-3">
						<Select label="Coach" name="coachUserId" value={t.coachUserId ?? ''} options={[{ value: '', label: 'None' }, ...t.members.map((m) => ({ value: m.id, label: m.name }))]} />
						<Select label="Video" name="videoUserId" value={t.videoUserId ?? ''} options={[{ value: '', label: 'None' }, ...t.members.map((m) => ({ value: m.id, label: m.name }))]} />
					</div>
					<fieldset class="flex items-center gap-2">
						<legend class="mb-2 text-sm font-medium">Colour</legend>
						{#each data.colours as c (c)}
							<label class="cursor-pointer">
								<input type="radio" name="colour" value={c} bind:group={colour} class="peer sr-only" />
								<span class="block size-7 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg" style="background: {c}"></span>
							</label>
						{/each}
					</fieldset>
					<FormAlert message={f?.action === 'update' ? f.message : null} />
					<Button type="submit" class="w-full" loading={busy === 'update'}>Save</Button>
				</form>
			</Card>
			<form method="POST" action="?/delete" use:enhance={(e) => { if (!confirm(`Delete ${t.name}? This can’t be undone.`)) e.cancel(); }}>
				<Button type="submit" variant="ghost" class={cn('w-full text-danger hover:text-danger')}><JIcon name="trash" class="size-4" /> Delete team</Button>
			</form>
		{:else}
			<Card>
				<p class="text-sm text-muted">{t.dz ? 'This team is managed by the dropzone.' : 'Only the team owner can change members and settings.'}</p>
				{#if !t.dz}
					<form method="POST" action="?/leave" class="mt-3" use:enhance={(e) => { if (!confirm(`Leave ${t.name}?`)) e.cancel(); }}>
						<Button type="submit" variant="secondary" size="sm"><JIcon name="logOut" class="size-4" /> Leave team</Button>
					</form>
				{/if}
				<FormAlert class="mt-3" message={f?.action === 'leave' ? f.message : null} />
			</Card>
		{/if}
	</aside>
</div>
