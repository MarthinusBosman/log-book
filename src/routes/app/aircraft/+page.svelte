<script lang="ts">
	import { enhance } from '$app/forms';
	import { Avatar, Badge, Button, Card, Dialog, EmptyState, Icon, Input, Select } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/staffadmin/PageHeader.svelte';
	import Switch from '#lib/components/staffadmin/Switch.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	type Plane = (typeof data.fleet)[number];

	let editing = $state<Plane | 'new' | null>(null);
	let deleting = $state<Plane | null>(null);
	let pending = $state(false);
	const plane = $derived(editing && editing !== 'new' ? editing : null);
	const pilotOptions = $derived([{ value: '', label: 'No default pilot' }, ...data.pilots.map((p) => ({ value: p.id, label: p.name }))]);
	const pilotName = (id: string | null) => data.pilots.find((p) => p.id === id)?.name ?? null;
</script>

<svelte:head><title>Aircraft</title></svelte:head>

<PageHeader icon="plane" title="Aircraft" description="Fleet, capacity, weight limits and pilots.">
	{#snippet actions()}
		<Button onclick={() => (editing = 'new')}><Icon name="plus" class="size-4" /> Add plane</Button>
	{/snippet}
</PageHeader>

<section class="mt-8">
	<h2 class="text-sm font-medium tracking-wide text-muted uppercase">Fleet</h2>
	{#if data.fleet.length === 0}
		<EmptyState class="mt-3" title="No planes yet" description="Add your aircraft so loads get the right capacity and weight limit.">
			{#snippet icon()}<Icon name="plane" class="size-6" />{/snippet}
			{#snippet action()}<Button onclick={() => (editing = 'new')}><Icon name="plus" class="size-4" /> Add plane</Button>{/snippet}
		</EmptyState>
	{:else}
		<div class="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each data.fleet as a (a.id)}
				<Card class={a.active ? '' : 'opacity-70'}>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="truncate font-semibold tracking-tight">{a.name}</p>
							<p class="font-mono text-xs text-muted">{a.tailNumber ?? 'No tail number'}</p>
						</div>
						{#if a.active}<Badge tone="success" dot>In service</Badge>{:else}<Badge>Inactive</Badge>{/if}
					</div>
					<dl class="mt-4 grid grid-cols-3 gap-2 text-center">
						<div class="rounded-xl bg-surface-2/60 py-2">
							<dt class="text-[11px] text-muted uppercase">Pax</dt>
							<dd class="text-lg font-semibold tabular-nums">{a.capacity}</dd>
						</div>
						<div class="rounded-xl bg-surface-2/60 py-2">
							<dt class="text-[11px] text-muted uppercase">Max kg</dt>
							<dd class="text-lg font-semibold tabular-nums">{a.weightLimitKg ?? '—'}</dd>
						</div>
						<div class="rounded-xl bg-surface-2/60 py-2">
							<dt class="text-[11px] text-muted uppercase">Loads 30d</dt>
							<dd class="text-lg font-semibold tabular-nums">{a.loads30}</dd>
						</div>
					</dl>
					<div class="mt-4 flex items-center justify-between gap-2">
						<p class="truncate text-sm text-muted">
							<Icon name="user" class="mr-1 inline size-4 align-[-3px]" />{pilotName(a.defaultPilotId) ?? 'No default pilot'}
						</p>
						<div class="flex gap-1">
							<Button size="sm" variant="secondary" onclick={() => (editing = a)}>Edit</Button>
							<Button size="sm" variant="ghost" onclick={() => (deleting = a)} aria-label="Delete {a.name}">Delete</Button>
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</section>

<section class="mt-10">
	<div class="flex items-end justify-between gap-3">
		<h2 class="text-sm font-medium tracking-wide text-muted uppercase">Pilots</h2>
		<a href="/app/settings/members" class="text-sm text-primary hover:underline">Manage roles</a>
	</div>
	<div class="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-border bg-surface-2/60 text-left text-xs tracking-wide text-muted uppercase">
					<th class="px-4 py-2.5 font-medium">Pilot</th>
					<th class="px-4 py-2.5 text-right font-medium">Weight</th>
					<th class="px-4 py-2.5 text-right font-medium">Loads 30d</th>
					<th class="hidden px-4 py-2.5 font-medium sm:table-cell">Default on</th>
				</tr>
			</thead>
			<tbody>
				{#each data.pilots as p (p.id)}
					<tr class="border-b border-border/70 last:border-0">
						<td class="px-4 py-2.5">
							<div class="flex items-center gap-3">
								<Avatar name={p.name} src={p.avatar} size="sm" />
								<div class="min-w-0">
									<p class="truncate font-medium">{p.name}</p>
									<p class="truncate text-xs text-muted">{p.email}</p>
								</div>
							</div>
						</td>
						<td class="px-4 py-2.5 text-right tabular-nums">{p.weightKg ? `${p.weightKg} kg` : '—'}</td>
						<td class="px-4 py-2.5 text-right tabular-nums">{p.loads30}</td>
						<td class="hidden px-4 py-2.5 text-muted sm:table-cell">{p.planes.join(', ') || '—'}</td>
					</tr>
				{:else}
					<tr><td colspan="4" class="px-4 py-8 text-center text-muted">No pilots yet. Give someone the Pilot role under Settings → Members.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<Dialog open={!!editing} onclose={() => (editing = null)} title={plane ? `Edit ${plane.name}` : 'Add plane'} variant="right">
	{#if editing}
		{#key plane?.id ?? 'new'}
			<form
				method="POST"
				action={plane ? '?/update' : '?/create'}
				class="space-y-4"
				use:enhance={toastEnhance({ pending: (v) => (pending = v), onSuccess: () => (editing = null) })}
			>
				{#if plane}<input type="hidden" name="id" value={plane.id} />{/if}
				<Input label="Plane name" name="name" required value={plane?.name ?? ''} placeholder="Cessna Caravan" />
				<Input label="Tail number" name="tailNumber" value={plane?.tailNumber ?? ''} placeholder="ZS-SKY" class="[&_input]:uppercase" />
				<div class="grid grid-cols-2 gap-3">
					<Input label="Pax (jumper slots)" name="capacity" type="number" min="1" max="100" required value={plane?.capacity ?? ''} />
					<Input label="Weight limit (kg)" name="weightLimitKg" type="number" min="1" step="1" value={plane?.weightLimitKg ?? ''} hint="Jumpers + pilot" />
				</div>
				<Select label="Default pilot" name="defaultPilotId" value={plane?.defaultPilotId ?? ''} options={pilotOptions} />
				{#if plane}
					<input type="hidden" name="active" value="false" />
					<div class="rounded-xl border border-border px-3">
						<Switch name="active" label="In service" description="Inactive planes can't be picked for new loads." checked={plane.active} />
					</div>
				{/if}
				<Button type="submit" class="w-full" loading={pending}>{plane ? 'Save plane' : 'Add to fleet'}</Button>
			</form>
		{/key}
	{/if}
</Dialog>

<Dialog open={!!deleting} onclose={() => (deleting = null)} title="Delete plane?">
	{#if deleting}
		<p class="text-sm text-muted">Delete {deleting.name}? Past loads keep the plane name; you can't undo this.</p>
		<form method="POST" action="?/delete" class="mt-5 flex justify-end gap-2" use:enhance={toastEnhance({ onSuccess: () => (deleting = null) })}>
			<input type="hidden" name="id" value={deleting.id} />
			<Button variant="ghost" onclick={() => (deleting = null)}>Cancel</Button>
			<Button type="submit" variant="danger">Delete</Button>
		</form>
	{/if}
</Dialog>
