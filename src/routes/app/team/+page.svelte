<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Avatar, Badge, Button, Card, EmptyState, Icon, Input, Select, cn, toast } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const f = $derived(form as { action?: string; message?: string } | null);
	const showCreate = $derived(page.url.searchParams.has('new') || f?.action === 'create');
	let colour = $state('#3b82f6');
	const quiet = () => async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
		await update();
		const msg = (result.data as { success?: string; message?: string } | undefined);
		if (result.type === 'success' && msg?.success) toast.success(msg.success);
		else if (msg?.message) toast.error(msg.message);
	};
</script>

<svelte:head><title>Teams</title></svelte:head>

<PageHeader title="Teams" icon="team" description="Your teams and jump buddies. Manifest the whole team in one go.">
	{#snippet actions()}
		<Button href="?new=1" variant={showCreate ? 'secondary' : 'primary'} data-testid="new-team"><Icon name="plus" class="size-4" /> New team</Button>
	{/snippet}
</PageHeader>

{#if showCreate}
	<Card class="mb-6" title="Create a team">
		<form method="POST" action="?/create" class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="create-team" use:enhance>
			<Input label="Team name" name="name" placeholder="e.g. Sunset 4-way" required />
			<Select label="Discipline" name="discipline" value="" options={[{ value: '', label: 'Not set' }, ...data.disciplines.map((d) => ({ value: d, label: d }))]} />
			<fieldset class="flex items-center gap-1.5 pb-2.5">
				<legend class="sr-only">Colour</legend>
				{#each data.colours as c (c)}
					<label class="cursor-pointer">
						<input type="radio" name="colour" value={c} bind:group={colour} class="peer sr-only" />
						<span class="block size-6 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2" style="background: {c}"></span>
					</label>
				{/each}
			</fieldset>
			<FormAlert class="sm:col-span-3" message={f?.action === 'create' ? f.message : null} />
			<div class="sm:col-span-3"><Button type="submit">Create team</Button></div>
		</form>
	</Card>
{/if}

<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
	<section class="lg:col-span-2">
		{#if data.teams.length === 0}
			<EmptyState title="No teams yet" description="Create a team, add your teammates and manifest everyone on the same load with one tap.">
				{#snippet icon()}<Icon name="team" class="size-6" />{/snippet}
				{#snippet action()}<Button href="?new=1"><Icon name="plus" class="size-4" /> New team</Button>{/snippet}
			</EmptyState>
		{:else}
			<ul class="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="team-list">
				{#each data.teams as t (t.id)}
					<li>
						<a href="/app/team/{t.id}" class="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
							<div class="flex items-start gap-3">
								<span class="mt-1 size-3 shrink-0 rounded-full" style="background: {t.colour ?? 'var(--color-border-strong)'}"></span>
								<div class="min-w-0 flex-1">
									<p class="truncate font-semibold tracking-tight">{t.name}</p>
									<p class="text-sm text-muted">{t.discipline ?? 'Team'} · {t.members.length} {t.members.length === 1 ? 'member' : 'members'}</p>
								</div>
								{#if t.dz}<Badge>Dropzone team</Badge>{:else if t.mine}<Badge tone="brand">Owner</Badge>{/if}
							</div>
							<div class="mt-3 flex -space-x-2">
								{#each t.members.slice(0, 6) as m (m.id)}<Avatar name={m.name} src={m.avatar} size="sm" class="ring-2 ring-surface" />{/each}
								{#if t.members.length > 6}<span class="grid size-7 place-items-center rounded-full bg-surface-2 text-[11px] ring-2 ring-surface">+{t.members.length - 6}</span>{/if}
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<aside>
		<Card title="Jump buddies" description="People you jump with. Quick to add to teams." padded={false}>
			<form method="GET" class="flex gap-2 border-b border-border p-4">
				<label class="relative flex-1">
					<span class="sr-only">Search jumpers</span>
					<JIcon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
					<input type="search" name="q" value={data.q} placeholder="Search jumper’s name…" class="h-10 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-sm outline-none hover:border-border-strong focus:border-primary" />
				</label>
				<Button type="submit" variant="secondary">Find</Button>
			</form>
			{#if data.q}
				<ul class="divide-y divide-border border-b border-border" data-testid="buddy-results">
					{#each data.results as u (u.id)}
						<li class="flex items-center gap-3 px-4 py-2.5">
							<Avatar name={u.name} src={u.avatar} size="sm" />
							<span class="min-w-0 flex-1 text-sm"><span class="block truncate font-medium">{u.name}</span>{#if u.licence}<span class="text-xs text-muted">{u.licence}</span>{/if}</span>
							<form method="POST" action="?/buddy" use:enhance={quiet}>
								<input type="hidden" name="userId" value={u.id} />
								<Button type="submit" size="sm" variant="secondary"><Icon name="plus" class="size-4" /> Add</Button>
							</form>
						</li>
					{:else}
						<li class="px-4 py-3 text-sm text-muted">{data.q.length < 2 ? 'Type at least 2 letters.' : 'Nobody found.'}</li>
					{/each}
				</ul>
			{/if}
			<ul class="divide-y divide-border">
				{#each data.buddies as b (b.id)}
					<li class="flex items-center gap-3 px-4 py-2.5">
						<Avatar name={b.name} src={b.avatar} size="sm" />
						<span class="min-w-0 flex-1 text-sm"><span class="block truncate font-medium">{b.name}</span>{#if b.licence}<span class="text-xs text-muted">{b.licence}</span>{/if}</span>
						<form method="POST" action="?/unbuddy" use:enhance={(e) => { if (!confirm(`Remove ${b.name} from your friend list?`)) return e.cancel(); return quiet(); }}>
							<input type="hidden" name="userId" value={b.id} />
							<button type="submit" class="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Remove {b.name}"><JIcon name="x" class="size-4" /></button>
						</form>
					</li>
				{:else}
					<li class={cn('px-4 py-4 text-sm text-muted')}>No buddies yet. Search for someone you jump with.</li>
				{/each}
			</ul>
		</Card>
	</aside>
</div>
