<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { untrack } from 'svelte';
	import { gearViewHref, readGearView, type GearOnly } from '#lib/components/staffadmin/gear-view.ts';
	import { Avatar, Badge, Button, Dialog, EmptyState, Icon, Input, Select, Stat, Tabs } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/staffadmin/PageHeader.svelte';
	import DueBadge from '#lib/components/staffadmin/DueBadge.svelte';
	import SearchBox from '#lib/components/staffadmin/SearchBox.svelte';
	import Textarea from '#lib/components/staffadmin/Textarea.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	type Row = (typeof data.register)[number];
	type Rig = Row['rig'];

	// Tab, filter and the Add rig dialog follow the URL (?tab=members, ?show=attention, ?new=1):
	// dashboard deep links land on them, and reload/back/shared links keep the view.
	const initial = () => readGearView(page.url.searchParams);
	let tab = $state<string>(initial().tab);
	let q = $state('');
	let only = $state<GearOnly>(initial().only);
	let editing = $state<Rig | 'new' | null>(initial().adding ? 'new' : null);
	$effect(() => {
		const view = { tab: tab === 'members' ? 'members' : 'dz', only, adding: editing === 'new' } as const;
		untrack(() => {
			const href = gearViewHref(location.href, view);
			if (href !== location.href) replaceState(href, page.state);
		});
	});
	let servicing = $state<Rig | null>(null);
	let deleting = $state<Rig | null>(null);
	let pending = $state(false);
	let serviceKind = $state('reserve_repack');
	const rig = $derived(editing && editing !== 'new' ? editing : null);

	const needsAttention = (r: Row) =>
		r.availability === 'grounded' || r.repack.status === 'due_soon' || r.aad.status === 'due_soon' || r.aad.status === 'overdue';
	const filtered = $derived(
		data.register.filter((r) => {
			const t = q.trim().toLowerCase();
			if (t && !`${r.rig.name ?? ''} ${r.rig.container ?? ''} ${r.rig.mainCanopy ?? ''} ${r.rig.aadSerial ?? ''}`.toLowerCase().includes(t)) return false;
			if (only === 'attention') return needsAttention(r);
			return !only || r.availability === only;
		})
	);
	const counts = $derived({
		available: data.register.filter((r) => r.availability === 'available').length,
		inUse: data.register.filter((r) => r.availability === 'in_use').length,
		grounded: data.register.filter((r) => r.availability === 'grounded').length,
		attention: data.register.filter(needsAttention).length
	});
	const memberAlerts = $derived(data.members.filter((m) => [m.repack.status, m.aad_.status].some((s) => s === 'due_soon' || s === 'overdue')));
	let showAllMembers = $state(false);
	const memberRows = $derived(showAllMembers ? data.members : memberAlerts);

	const availTone = { available: 'success', in_use: 'brand', grounded: 'danger' } as const;
	const availLabel = { available: 'Available', in_use: 'In use', grounded: 'Grounded' } as const;
	const kindLabel: Record<string, string> = { rental: 'Rental', student: 'Student', tandem: 'Tandem', personal: 'Personal' };
	const kindOptions = [
		{ value: 'rental', label: 'Rental' },
		{ value: 'student', label: 'Student' },
		{ value: 'tandem', label: 'Tandem' }
	];
	const serviceOptions = [
		{ value: 'reserve_repack', label: 'Reserve repack' },
		{ value: 'aad_service', label: 'AAD service' },
		{ value: 'main_reline', label: 'Main reline' },
		{ value: 'inspection', label: 'Inspection' },
		{ value: 'other', label: 'Other' }
	];
</script>

<svelte:head><title>Gear</title></svelte:head>

<PageHeader icon="parachute" title="Gear" description="Rental and student rigs, reserve repacks and AAD service.">
	{#snippet actions()}
		<Button onclick={() => (editing = 'new')}><Icon name="plus" class="size-4" /> Add rig</Button>
	{/snippet}
</PageHeader>

<div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
	<Stat label="Available" value={counts.available} hint="ready to jump" />
	<Stat label="In use" value={counts.inUse} hint="checked out today" />
	<Stat label="Grounded" value={counts.grounded} hint="not airworthy" />
	<Stat label="Members' gear" value={memberAlerts.length} hint="due soon or overdue" />
</div>

<Tabs
	class="mt-6"
	bind:value={tab}
	tabs={[
		{ id: 'dz', label: 'DZ rigs', count: data.register.length },
		{ id: 'members', label: "Jumpers' gear", count: memberAlerts.length }
	]}
/>

{#if tab === 'dz'}
	<div class="mt-4 flex flex-col gap-3 sm:flex-row">
		<SearchBox bind:value={q} placeholder="Search rigs, canopies, AAD serial" class="flex-1" />
		<select bind:value={only} aria-label="Filter rigs" class="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary">
			<option value="">All rigs</option>
			<option value="attention">Needs attention ({counts.attention})</option>
			<option value="available">Available</option>
			<option value="in_use">In use</option>
			<option value="grounded">Grounded</option>
		</select>
	</div>

	{#if data.register.length === 0}
		<EmptyState class="mt-4" title="No DZ rigs yet" description="Add your rental, student and tandem rigs to track repacks and AAD service.">
			{#snippet icon()}<Icon name="parachute" class="size-6" />{/snippet}
			{#snippet action()}<Button onclick={() => (editing = 'new')}><Icon name="plus" class="size-4" /> Add rig</Button>{/snippet}
		</EmptyState>
	{:else}
		<div class="relative mt-3 overflow-x-auto rounded-2xl border border-border bg-surface">
			<table class="table-stack w-full text-sm [--stack-col:9rem] md:min-w-[52rem]">
				<thead>
					<tr class="border-b border-border bg-surface-2/60 text-left text-xs tracking-wide text-muted uppercase">
						<th class="py-2.5 pr-3 pl-4 font-medium">Rig</th>
						<th class="px-3 py-2.5 font-medium">Canopies</th>
						<th class="px-3 py-2.5 font-medium">Repack due</th>
						<th class="px-3 py-2.5 font-medium">AAD</th>
						<th class="px-3 py-2.5 font-medium">Status</th>
						<th class="py-2.5 pr-4 pl-3"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as r (r.rig.id)}
						<tr
							class="border-b border-border/70 align-top last:border-0 hover:bg-surface-2/40 {r.availability === 'grounded'
								? 'bg-danger/[0.04]'
								: ''}"
						>
							<td class="stack-full py-3 pr-3 pl-4">
								<p class="font-medium">{r.rig.name ?? 'Unnamed rig'}</p>
								<p class="text-xs text-muted">{kindLabel[r.rig.kind]}{r.rig.container ? ` · ${r.rig.container}` : ''}</p>
							</td>
							<td class="stack-full px-3 py-3 text-[13px]" data-label="Canopies">
								<p><span class="text-subtle">M</span> {r.rig.mainCanopy ?? '—'}{#if r.rig.mainSizeSqft}<span class="text-muted"> {r.rig.mainSizeSqft}</span>{/if}</p>
								<p><span class="text-subtle">R</span> {r.rig.reserveCanopy ?? '—'}{#if r.rig.reserveSizeSqft}<span class="text-muted"> {r.rig.reserveSizeSqft}</span>{/if}</p>
							</td>
							<td class="px-3 py-3" data-label="Repack due">
								<DueBadge status={r.repack.status} dueOn={r.repack.dueOn} daysLeft={r.repack.daysLeft} />
								<p class="mt-0.5 pl-1 text-[11px] whitespace-nowrap text-subtle tabular-nums">Packed {r.rig.reserveRepackedOn ?? '—'}</p>
							</td>
							<td class="px-3 py-3" data-label="AAD">
								<DueBadge status={r.aad.status} dueOn={r.aad.dueOn} daysLeft={r.aad.daysLeft} empty="No date" />
								{#if r.rig.aad}<p class="mt-0.5 pl-1 text-xs text-subtle">{r.rig.aad}{r.rig.aadSerial ? ` · ${r.rig.aadSerial}` : ''}</p>{/if}
							</td>
							<td class="stack-full px-3 py-3" data-label="Status">
								<Badge tone={availTone[r.availability]} dot>{availLabel[r.availability]}</Badge>
								{#if r.inUseBy}<p class="mt-1 text-xs text-muted">{r.inUseBy}</p>{/if}
								{#if r.groundedReason}<p class="mt-1 text-xs text-danger">{r.groundedReason}</p>{/if}
							</td>
							<td class="stack-full py-3 pr-4 pl-3">
								<div class="flex flex-wrap gap-1 md:justify-end">
									<Button size="sm" variant="secondary" onclick={() => ((serviceKind = 'reserve_repack'), (servicing = r.rig))}>Service</Button>
									<Button size="sm" variant="ghost" onclick={() => (editing = r.rig)}>Edit</Button>
									<form method="POST" action="?/ground" use:enhance={toastEnhance()}>
										<input type="hidden" name="id" value={r.rig.id} />
										<input type="hidden" name="active" value={r.rig.active ? 'false' : 'true'} />
										<Button size="sm" variant="ghost" type="submit">{r.rig.active ? 'Ground' : 'Unground'}</Button>
									</form>
								</div>
							</td>
						</tr>
					{:else}
						<tr><td colspan="6" class="px-4 py-10 text-center text-muted">No rigs match.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{:else}
	<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
		<p class="text-sm text-muted">Personal rigs of members at this dropzone. Contact owners before their reserve or AAD lapses.</p>
		<label class="inline-flex items-center gap-2 text-sm text-muted">
			<input type="checkbox" bind:checked={showAllMembers} class="size-4 accent-[var(--color-primary)]" /> Show all ({data.members.length})
		</label>
	</div>
	<div class="relative mt-3 overflow-x-auto rounded-2xl border border-border bg-surface">
		<table class="table-stack w-full text-sm [--stack-col:9rem] md:min-w-[44rem]">
			<thead>
				<tr class="border-b border-border bg-surface-2/60 text-left text-xs tracking-wide text-muted uppercase">
					<th class="py-2.5 pr-3 pl-4 font-medium">Jumper</th>
					<th class="px-3 py-2.5 font-medium">Rig</th>
					<th class="px-3 py-2.5 font-medium">Repack due</th>
					<th class="px-3 py-2.5 font-medium">AAD</th>
					<th class="py-2.5 pr-4 pl-3 font-medium">Contact</th>
				</tr>
			</thead>
			<tbody>
				{#each memberRows as m (m.rigId)}
					<tr class="border-b border-border/70 align-top last:border-0 hover:bg-surface-2/40">
						<td class="stack-full py-3 pr-3 pl-4">
							<a href="/app/jumpers/{m.owner.id}" class="flex items-center gap-3 hover:text-primary">
								<Avatar name={m.owner.name} src={m.owner.avatar} size="sm" />
								<span class="font-medium">{m.owner.name}</span>
							</a>
						</td>
						<td class="stack-full px-3 py-3" data-label="Rig">{m.rigName}<p class="text-xs text-muted">{m.container ?? ''}</p></td>
						<td class="px-3 py-3" data-label="Repack due"><DueBadge status={m.repack.status} dueOn={m.repack.dueOn} daysLeft={m.repack.daysLeft} /></td>
						<td class="px-3 py-3" data-label="AAD"><DueBadge status={m.aad_.status} dueOn={m.aad_.dueOn} daysLeft={m.aad_.daysLeft} empty="No date" /></td>
						<td class="stack-full py-3 pr-4 pl-3 text-xs" data-label="Contact">
							<a href="mailto:{m.owner.email}" class="text-primary hover:underline">{m.owner.email}</a>
							{#if m.owner.phone}<p class="text-muted">{m.owner.phone}</p>{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="px-4 py-10 text-center text-muted">
							{showAllMembers ? 'No member rigs on file.' : 'All member gear is current. Nothing due in the warning window.'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<Dialog open={!!editing} onclose={() => (editing = null)} title={rig ? `Edit ${rig.name ?? 'rig'}` : 'Add rig'} variant="right">
	{#if editing}
		{#key rig?.id ?? 'new'}
			<form
				method="POST"
				action={rig ? '?/update' : '?/create'}
				class="space-y-4"
				use:enhance={toastEnhance({ pending: (v) => (pending = v), onSuccess: () => (editing = null) })}
			>
				{#if rig}<input type="hidden" name="id" value={rig.id} />{/if}
				<div class="grid grid-cols-2 gap-3">
					<Input label="Name / number" name="name" required value={rig?.name ?? ''} placeholder="Student 4" />
					<Select label="Type" name="kind" value={rig?.kind ?? 'rental'} options={kindOptions} />
				</div>
				<Input label="Container" name="container" value={rig?.container ?? ''} placeholder="Javelin Odyssey" />
				<div class="grid grid-cols-[1fr_6rem] gap-3">
					<Input label="Main canopy" name="mainCanopy" value={rig?.mainCanopy ?? ''} placeholder="Navigator" />
					<Input label="Size (ft²)" name="mainSizeSqft" type="number" min="1" value={rig?.mainSizeSqft ?? ''} />
				</div>
				<div class="grid grid-cols-[1fr_6rem] gap-3">
					<Input label="Reserve canopy" name="reserveCanopy" value={rig?.reserveCanopy ?? ''} placeholder="Smart" />
					<Input label="Size (ft²)" name="reserveSizeSqft" type="number" min="1" value={rig?.reserveSizeSqft ?? ''} />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Input label="Last reserve repack" name="reserveRepackedOn" type="date" required min="1900-01-01" max={data.today} value={rig?.reserveRepackedOn ?? ''} />
					<Input label="Repack interval (days)" name="repackIntervalDays" type="number" min="1" value={rig?.repackIntervalDays ?? ''} hint="Blank = DZ default" />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Input label="AAD" name="aad" value={rig?.aad ?? ''} placeholder="Cypres 2" />
					<Input label="AAD serial" name="aadSerial" value={rig?.aadSerial ?? ''} />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Input label="AAD service due" name="aadServiceDueOn" type="date" min="1900-01-01" value={rig?.aadServiceDueOn ?? ''} />
					<Input label="AAD end of life" name="aadExpiresOn" type="date" min="1900-01-01" value={rig?.aadExpiresOn ?? ''} />
				</div>
				<Textarea label="Notes" name="notes" value={rig?.notes ?? ''} rows={2} />
				<Button type="submit" class="w-full" loading={pending}>{rig ? 'Save rig' : 'Add to register'}</Button>
				{#if rig}
					<button type="button" class="w-full text-center text-sm text-danger hover:underline" onclick={() => ((deleting = rig), (editing = null))}>
						Delete this rig
					</button>
				{/if}
			</form>
		{/key}
	{/if}
</Dialog>

<Dialog open={!!servicing} onclose={() => (servicing = null)} title="Record service" description={servicing?.name ?? ''}>
	{#if servicing}
		<form method="POST" action="?/service" class="space-y-4" use:enhance={toastEnhance({ pending: (v) => (pending = v), onSuccess: () => (servicing = null) })}>
			<input type="hidden" name="id" value={servicing.id} />
			<Select label="Work done" name="kind" bind:value={serviceKind} options={serviceOptions} />
			<div class="grid grid-cols-2 gap-3">
				<Input label="Date" name="performedOn" type="date" required min="1900-01-01" max={data.today} value={data.today} />
				<Input label="Rigger no." name="riggerNumber" placeholder="Optional" />
			</div>
			{#if serviceKind === 'aad_service'}
				<Input label="Next AAD service due" name="nextDueOn" type="date" required min={data.today} />
			{/if}
			<Textarea label="Notes" name="notes" rows={2} />
			<Button type="submit" class="w-full" loading={pending}>Save</Button>
		</form>
	{/if}
</Dialog>

<Dialog open={!!deleting} onclose={() => (deleting = null)} title="Delete rig?">
	{#if deleting}
		<p class="text-sm text-muted">Delete {deleting.name ?? 'this rig'} and its service history? You can't undo this. To take it out of use, ground it instead.</p>
		<form method="POST" action="?/delete" class="mt-5 flex justify-end gap-2" use:enhance={toastEnhance({ onSuccess: () => (deleting = null) })}>
			<input type="hidden" name="id" value={deleting.id} />
			<Button variant="ghost" onclick={() => (deleting = null)}>Cancel</Button>
			<Button type="submit" variant="danger">Delete</Button>
		</form>
	{/if}
</Dialog>
