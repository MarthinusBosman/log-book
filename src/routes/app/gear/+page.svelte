<script lang="ts">
	import NoJsOutcome from '#lib/components/staffadmin/NoJsOutcome.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { gearViewParams, readGearView, type GearOnly, type GearTab, type GearView } from '#lib/components/staffadmin/gear-view.ts';
	import { readQuery, revealInRow } from '#lib/components/staffadmin/list-view.ts';
	import { newDialogHref, openInPlace, viewParamsHref } from '#lib/components/staffadmin/open-dialog.ts';
	import { cn } from '#lib/ui/index.ts';
	import { syncViewToUrl } from '#lib/components/staffadmin/url-sync.svelte.ts';
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
	let q = $state(readQuery(page.url.searchParams));
	let only = $state<GearOnly>(initial().only);
	// A row's Edit / Service / Delete are links too (?edit=<rigId>, ?service=<rigId>,
	// ?delete=<rigId>): the server renders that dialog open, so they work before hydration and
	// without JS; once hydrated they open in place and the URL follows.
	const rigParam = (key: string) => {
		const id = page.url.searchParams.get(key);
		return id && data.register.some((r) => r.rig.id === id) ? id : null;
	};
	const findRig = (id: string | null) => (id ? (data.register.find((r) => r.rig.id === id)?.rig ?? null) : null);
	let editingId = $state<string | null>(initial().adding ? 'new' : rigParam('edit'));
	let servicingId = $state<string | null>(rigParam('service'));
	let deletingId = $state<string | null>(rigParam('delete'));
	// svelte-ignore state_referenced_locally
	let showAllMembers = $state(initial().allMembers);
	const view = (): GearView => ({ tab: (tab === 'members' ? 'members' : 'dz') as GearTab, only, adding: editingId === 'new', allMembers: showAllMembers });
	const rig = $derived<Rig | null>(editingId === 'new' ? null : findRig(editingId));
	const servicing = $derived<Rig | null>(findRig(servicingId));
	const deleting = $derived<Rig | null>(findRig(deletingId));
	const noDialog = { new: null, edit: null, service: null, delete: null };
	syncViewToUrl(() => ({ q: q.trim(), ...gearViewParams(view()), edit: rig?.id ?? null, service: servicing?.id ?? null, delete: deleting?.id ?? null }));
	// Tabs and the "Due soon / All" switch are links to the view they show (work without JS);
	// hydrated clicks switch in place and syncViewToUrl writes the same URL.
	const viewHref = (set: Partial<GearView>) => viewParamsHref(page.url, { ...noDialog, ...gearViewParams({ ...view(), adding: false, ...set }) });
	const dialogHref = (set: Record<string, string>) => viewParamsHref(page.url, { ...noDialog, ...set });
	const openDialog = (set: { edit?: string; service?: string; delete?: string }) =>
		openInPlace(() => {
			editingId = set.edit ?? null;
			servicingId = set.service ?? null;
			deletingId = set.delete ?? null;
			if (set.service) serviceKind = 'reserve_repack';
		});
	let pending = $state(false);
	let serviceKind = $state('reserve_repack');
	// A link to ?new=1, so it works before hydration (the server renders the form open);
	// once hydrated it just opens the dialog.
	const addRig = openInPlace(() => ((editingId = 'new'), (servicingId = null), (deletingId = null)));

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
	const chips = $derived(
		[
			{ id: '' as GearOnly, label: 'All rigs', n: data.register.length },
			{ id: 'attention' as GearOnly, label: 'Needs attention', n: counts.attention },
			{ id: 'available' as GearOnly, label: 'Available', n: counts.available },
			{ id: 'in_use' as GearOnly, label: 'In use', n: counts.inUse },
			{ id: 'grounded' as GearOnly, label: 'Grounded', n: counts.grounded }
		].filter((c) => c.id === '' || c.n > 0 || c.id === only)
	);
	// On a phone the chip row scrolls sideways: keep the active chip in view.
	let chipBar = $state<HTMLElement>();
	$effect(() => {
		void only;
		const bar = chipBar;
		const el = bar?.querySelector<HTMLElement>('[data-active]');
		if (bar && el) revealInRow(bar, el);
	});
	const memberAlerts = $derived(data.members.filter((m) => [m.repack.status, m.aad_.status].some((s) => s === 'due_soon' || s === 'overdue')));
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
		<Button href={newDialogHref(page.url)} onclick={addRig}><Icon name="plus" class="size-4" /> Add rig</Button>
	{/snippet}
</PageHeader>
<NoJsOutcome />

<div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
	<Stat label="Available" value={counts.available} hint="ready to jump" />
	<Stat label="In use" value={counts.inUse} hint="checked out today" />
	<Stat label="Grounded" value={counts.grounded} hint="not airworthy" />
	<Stat label="Members' gear" value={memberAlerts.length} hint="due soon or overdue" />
</div>

<Tabs
	class="mt-6"
	bind:value={tab}
	href={(id) => viewHref({ tab: id === 'members' ? 'members' : 'dz' })}
	tabs={[
		{ id: 'dz', label: 'DZ rigs', count: data.register.length },
		{ id: 'members', label: "Jumpers' gear", count: memberAlerts.length }
	]}
/>

{#if tab === 'dz'}
	<!-- Without JS, Enter submits the search natively (the server renders the filtered list); the
	     hidden field keeps the active chip. -->
	<form method="GET" class="mt-4" onsubmit={(e) => e.preventDefault()}>
		<SearchBox bind:value={q} name="q" placeholder="Search rigs, canopies, AAD serial" />
		{#if only}<input type="hidden" name="show" value={only} />{/if}
	</form>
	<!-- Chips are ?show= links so they work before hydration and without JS; once hydrated they
	     switch the filter in place. -->
	<nav aria-label="Filter rigs" bind:this={chipBar} class="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
		{#each chips as c (c.id)}
			<a
				href={viewParamsHref(page.url, { ...noDialog, show: c.id || null })}
				onclick={openInPlace(() => (only = c.id))}
				aria-current={only === c.id ? 'true' : undefined}
				data-active={only === c.id ? '' : undefined}
				data-sveltekit-reset="false"
				class={cn(
					'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
					only === c.id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-surface text-muted hover:text-fg'
				)}
			>
				{c.label}<span class="font-normal tabular-nums">{c.n}</span>
			</a>
		{/each}
	</nav>

	{#if data.register.length === 0}
		<EmptyState class="mt-4" title="No DZ rigs yet" description="Add your rental, student and tandem rigs to track repacks and AAD service.">
			{#snippet icon()}<Icon name="parachute" class="size-6" />{/snippet}
			{#snippet action()}<Button href={newDialogHref(page.url)} onclick={addRig}><Icon name="plus" class="size-4" /> Add rig</Button>{/snippet}
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
									<Button
										size="sm"
										variant="secondary"
										href={dialogHref({ service: r.rig.id })}
										onclick={openDialog({ service: r.rig.id })}
										aria-label="Service {r.rig.name ?? 'rig'}">Service</Button
									>
									<Button size="sm" variant="ghost" href={dialogHref({ edit: r.rig.id })} onclick={openDialog({ edit: r.rig.id })} aria-label="Edit {r.rig.name ?? 'rig'}"
										>Edit</Button
									>
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
		<nav aria-label="Jumpers' gear shown" class="inline-flex gap-1.5">
			{#each [{ all: false, label: 'Due soon', n: memberAlerts.length }, { all: true, label: 'All rigs', n: data.members.length }] as c (c.label)}
				<a
					href={viewHref({ tab: 'members', allMembers: c.all })}
					onclick={openInPlace(() => (showAllMembers = c.all))}
					aria-current={showAllMembers === c.all ? 'true' : undefined}
					data-sveltekit-reset="false"
					class={cn(
						'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
						showAllMembers === c.all ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-surface text-muted hover:text-fg'
					)}
				>
					{c.label}<span class="font-normal tabular-nums">{c.n}</span>
				</a>
			{/each}
		</nav>
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

<Dialog open={editingId === 'new' || !!rig} onclose={() => (editingId = null)} title={rig ? `Edit ${rig.name ?? 'rig'}` : 'Add rig'} variant="right">
	{#if editingId === 'new' || rig}
		{#key rig?.id ?? 'new'}
			<form
				method="POST"
				action={rig ? '?/update' : '?/create'}
				class="space-y-4"
				use:enhance={toastEnhance({ pending: (v) => (pending = v), onSuccess: () => (editingId = null) })}
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
					<a
						href={dialogHref({ delete: rig.id })}
						onclick={openDialog({ delete: rig.id })}
						data-sveltekit-reset="false"
						class="block w-full text-center text-sm text-danger hover:underline">Delete this rig</a
					>
				{/if}
			</form>
		{/key}
	{/if}
</Dialog>

<Dialog open={!!servicing} onclose={() => (servicingId = null)} title="Record service" description={servicing?.name ?? ''}>
	{#if servicing}
		<!-- The next-due date shows only for an AAD service: CSS follows the selected option, so the
		     field appears without JS too (the server still requires it for AAD services). -->
		<form
			method="POST"
			action="?/service"
			class="space-y-4"
			use:enhance={toastEnhance({ pending: (v) => (pending = v), onSuccess: () => (servicingId = null) })}
		>
			<input type="hidden" name="id" value={servicing.id} />
			<Select label="Work done" name="kind" bind:value={serviceKind} options={serviceOptions} />
			<div class="grid grid-cols-2 gap-3">
				<Input label="Date" name="performedOn" type="date" required min="1900-01-01" max={data.today} value={data.today} />
				<Input label="Rigger no." name="riggerNumber" placeholder="Optional" />
			</div>
			<div class="aad-next-due" data-testid="aad-next-due">
				<Input label="Next AAD service due" name="nextDueOn" type="date" required={serviceKind === 'aad_service'} min={data.today} />
			</div>
			<Textarea label="Notes" name="notes" rows={2} />
			<Button type="submit" class="w-full" loading={pending}>Save</Button>
		</form>
	{/if}
</Dialog>

<Dialog open={!!deleting} onclose={() => (deletingId = null)} title="Delete rig?">
	{#if deleting}
		<p class="text-sm text-muted">Delete {deleting.name ?? 'this rig'} and its service history? You can't undo this. To take it out of use, ground it instead.</p>
		<form method="POST" action="?/delete" class="mt-5 flex justify-end gap-2" use:enhance={toastEnhance({ onSuccess: () => (deletingId = null) })}>
			<input type="hidden" name="id" value={deleting.id} />
			<Button variant="ghost" href={dialogHref({ edit: deleting.id })} onclick={openDialog({ edit: deleting.id })} data-sveltekit-reset="false">Cancel</Button>
			<Button type="submit" variant="danger">Delete</Button>
		</form>
	{/if}
</Dialog>

<style>
	/* Shown only for an AAD service; follows the selected option, so it works without JS too. */
	.aad-next-due {
		display: none;
	}
	form:has(:global(option[value='aad_service']:checked)) .aad-next-due {
		display: block;
	}
</style>
