<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Avatar, Button, Card, EmptyState, Icon, Input, Select } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/staffadmin/PageHeader.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const f = $derived(form as { action?: string; message?: string } | null);
	// "New team" is a ?new=1 link so it works before hydration and without JS.
	const showCreate = $derived(page.url.searchParams.has('new') || f?.action === 'create');
	let colour = $state('#3b82f6');
	let pending = $state(false);
	const staffLine = (t: (typeof data.teams)[number]) =>
		[t.coach && `Coach ${t.coach}`, t.video && `Video ${t.video}`].filter(Boolean).join(' · ');
</script>

<svelte:head><title>Dropzone teams</title></svelte:head>

<PageHeader icon="team" title="Dropzone teams" description="Teams you run at the dropzone, with their coach and video flyer. Manifest puts a whole team on a load from the Team tab.">
	{#snippet actions()}
		<Button href="?new=1" variant={showCreate ? 'secondary' : 'primary'} data-testid="new-dz-team"><Icon name="plus" class="size-4" /> New team</Button>
	{/snippet}
</PageHeader>

{#if showCreate}
	<Card class="mt-6" title="Create a team" description="Add members, a coach and a video flyer on the next page.">
		<form
			method="POST"
			action="?/create"
			class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
			data-testid="create-dz-team"
			use:enhance={() => {
				pending = true;
				return async ({ update }) => {
					await update();
					pending = false;
				};
			}}
		>
			<Input label="Team name" name="name" placeholder="e.g. Coast 4-way" required />
			<Select label="Discipline" name="discipline" value="" options={[{ value: '', label: 'Not set' }, ...data.disciplines.map((d) => ({ value: d, label: d }))]} />
			<fieldset class="flex items-center gap-1.5 pb-2.5">
				<legend class="sr-only">Colour</legend>
				{#each data.colours as c (c.value)}
					<label class="cursor-pointer" title={c.name}>
						<input type="radio" name="colour" value={c.value} bind:group={colour} aria-label={c.name} class="peer sr-only" />
						<span class="block size-6 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2 peer-focus-visible:ring-primary" style="background: {c.value}"></span>
					</label>
				{/each}
			</fieldset>
			<FormAlert class="sm:col-span-3" message={f?.action === 'create' || (f?.message && !f?.action) ? f?.message : null} />
			<div class="sm:col-span-3"><Button type="submit" loading={pending}>Create team</Button></div>
		</form>
	</Card>
{/if}

<section class="mt-8">
	{#if data.teams.length === 0}
		<EmptyState title="No dropzone teams yet" description="Create teams for your regular groups (4-way, freefly, camps) so manifest can put everyone on a load in one go.">
			{#snippet icon()}<Icon name="team" class="size-6" />{/snippet}
			{#snippet action()}<Button href="?new=1"><Icon name="plus" class="size-4" /> New team</Button>{/snippet}
		</EmptyState>
	{:else}
		<ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="dz-team-list">
			{#each data.teams as t (t.id)}
				<li>
					<a href="/app/team/{t.id}" class="block h-full rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
						<div class="flex items-start gap-3">
							<span class="mt-1.5 size-3 shrink-0 rounded-full" style="background: {t.colour ?? 'var(--color-border-strong)'}"></span>
							<div class="min-w-0 flex-1">
								<p class="truncate font-semibold tracking-tight">{t.name}</p>
								<p class="text-sm text-muted">{t.discipline ?? 'Team'} · {t.members.length} {t.members.length === 1 ? 'member' : 'members'}</p>
								{#if staffLine(t)}<p class="truncate text-sm text-muted">{staffLine(t)}</p>{/if}
							</div>
						</div>
						{#if t.members.length}
							<div class="mt-3 flex -space-x-2">
								{#each t.members.slice(0, 6) as m (m.id)}<Avatar name={m.name} src={m.avatar} size="sm" class="ring-2 ring-surface" />{/each}
								{#if t.members.length > 6}<span class="grid size-7 place-items-center rounded-full bg-surface-2 text-[11px] ring-2 ring-surface">+{t.members.length - 6}</span>{/if}
							</div>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
