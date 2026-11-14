<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Select } from '#lib/ui/index.ts';
	import { ROLE_LABELS, SLOT_EXTRA_LABELS, SLOT_STAFF_ROLE_LABELS, formatMoney, type DropzoneRole, type JumpType, type SlotExtra } from '#lib/domain/constants.ts';
	import { cn } from '#lib/ui/cn.ts';
	import { page } from '$app/state';
	import { act } from './forms.ts';
	import { alsoOnLabel, formAction } from './manifest.ts';
	import JumpFields from './JumpFields.svelte';
	import PeoplePicker, { type Person } from './PeoplePicker.svelte';

	type Checked = { id: string; name: string; avatar?: string | null; licence: string | null; weightKg: number | null; expired: boolean; onLoad: boolean; otherLoads?: number[]; gearRental: boolean };
	type Member = { id: string; name: string; avatar?: string | null; licence: string | null; roles: DropzoneRole[]; onLoad: boolean; otherLoads?: number[] };
	type Staff = { id: string; name: string; avatar?: string | null; roles: DropzoneRole[]; colour: string | null; onLoad: boolean; otherLoads?: number[] };
	type Passenger = { id: string; name: string; weightKg: number | null; extras: SlotExtra[]; totalMinor: number; depositMinor: number; bookingTime: string | null };
	type Team = { id: string; name: string; discipline: string | null; colour: string | null };

	type Props = {
		loadId: string;
		currency: string;
		free: number;
		walletEnabled: boolean;
		checkedIn: Checked[];
		members: Member[];
		staff: Staff[];
		passengers: Passenger[];
		teams: Team[];
	};
	let { loadId, currency, free, walletEnabled, checkedIn, members, staff, passengers, teams }: Props = $props();

	let tab = $state('checked');
	let busy = $state(false);
	let lastError = $state<string | null>(null);

	// shared jump options per tab
	let selChecked = $state<string[]>([]);
	let selMembers = $state<string[]>([]);
	let selStaff = $state<string[]>([]);
	let jtA = $state<JumpType>('belly');
	let exA = $state<SlotExtra[]>([]);
	let jtB = $state<JumpType>('belly');
	let exB = $state<SlotExtra[]>([]);
	let jtStaff = $state<JumpType>('tandem');
	let staffRole = $state('tandem_instructor');
	let jtTeam = $state<JumpType>('belly');
	let exTeam = $state<SlotExtra[]>([]);
	let jtCustom = $state<JumpType>('belly');
	let exCustom = $state<SlotExtra[]>([]);
	let passengerId = $state('');
	let tiId = $state('');
	let videoId = $state('');

	const checkedPeople = $derived<Person[]>(
		checkedIn.map((c) => ({
			id: c.id,
			name: c.name,
			avatar: c.avatar,
			sub: [c.licence ?? 'Student', c.gearRental ? 'rental gear' : null].filter(Boolean).join(' · '),
			weightKg: c.weightKg,
			warn: c.expired ? 'Expired' : null,
			onLoad: c.onLoad,
			alsoOn: c.otherLoads
		}))
	);
	const memberPeople = $derived<Person[]>(
		members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, sub: m.licence ?? m.roles.map((r) => ROLE_LABELS[r]).join(', '), onLoad: m.onLoad, alsoOn: m.otherLoads }))
	);
	const staffPeople = $derived<Person[]>(
		staff.map((s) => ({
			id: s.id,
			name: s.name,
			avatar: s.avatar,
			sub: s.roles.filter((r) => r !== 'jumper').map((r) => ROLE_LABELS[r]).join(', '),
			colour: s.colour,
			onLoad: s.onLoad,
			alsoOn: s.otherLoads
		}))
	);
	const tis = $derived(staff.filter((s) => s.roles.includes('tandem_instructor') && !s.onLoad));
	const videos = $derived(staff.filter((s) => s.roles.includes('videographer') && !s.onLoad));
	const passenger = $derived(passengers.find((p) => p.id === passengerId) ?? null);

	const tabs = $derived([
		{ id: 'checked', label: 'Checked in', count: checkedIn.filter((c) => !c.onLoad).length },
		{ id: 'tandem', label: 'Tandem', count: passengers.length },
		{ id: 'team', label: 'Team', count: teams.length },
		{ id: 'staff', label: 'Staff' },
		{ id: 'members', label: 'Members' },
		{ id: 'custom', label: 'Custom' }
	]);

	const done = (reset: () => void) =>
		act({
			pending: (b) => (busy = b),
			success: (d) => (Number(d.added) === 1 ? 'Jumper added to load' : `${d.added} slots added to load`),
			onSuccess: () => {
				lastError = null;
				reset();
			},
			onError: (m) => (lastError = m)
		});
	const box = 'flex items-start gap-2.5 text-sm';
	const check = 'mt-0.5 size-4 accent-[var(--dz-primary)]';
</script>

{#snippet options(multi: boolean, single: boolean)}
	<div class="flex flex-col gap-2 rounded-xl border border-border p-3">
		{#if multi}
			<label class={box}><input type="checkbox" name="asGroup" checked class={check} /><span>Jump together as a group</span></label>
		{/if}
		{#if single}
			<label class={box}><input type="checkbox" name="isLoadMaster" class={check} /><span>Load master (LM) for this load</span></label>
		{/if}
		{#if walletEnabled}
			<label class={box}>
				<input type="checkbox" name="skipWallet" class={check} />
				<span>Pay at manifest <span class="block text-xs text-muted">Don't reserve the slot in the jumper's wallet.</span></span>
			</label>
		{/if}
		<label class={box}><input type="checkbox" name="allowExpired" class={check} /><span>Allow expired membership</span></label>
	</div>
{/snippet}

{#snippet errorBox()}
	{#if lastError}<p role="alert" class="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" data-testid="add-error">{lastError}</p>{/if}
{/snippet}

<section class="rounded-2xl border border-border bg-surface" aria-labelledby="add-title" id="add">
	<header class="flex items-center justify-between border-b border-border px-4 py-3">
		<h2 id="add-title" class="font-semibold tracking-tight">Add to load</h2>
		<span class={cn('text-xs font-medium', free === 0 ? 'text-danger' : 'text-muted')}>{free === 0 ? 'Load is full' : `${free} slot${free === 1 ? '' : 's'} left`}</span>
	</header>
	<div class="p-4">
		<div role="tablist" aria-label="Who to add" class="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2/60 p-1">
			{#each tabs as t (t.id)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === t.id}
					class={cn(
						'flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium whitespace-nowrap transition-colors',
						tab === t.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
					)}
					onclick={() => (tab = t.id)}
				>
					{t.label}{#if t.count}<span class="rounded bg-surface-2 px-1 text-[11px] text-muted tabular-nums">{t.count}</span>{/if}
				</button>
			{/each}
		</div>
		<div class="mt-4" role="tabpanel">
				{#if tab === 'checked'}
					<form method="POST" action={formAction(page.url, 'addMembers')} class="flex flex-col gap-3" use:enhance={done(() => (selChecked = []))}>
						<input type="hidden" name="loadId" value={loadId} />
						<PeoplePicker idPrefix="ci" people={checkedPeople} bind:selected={selChecked} empty="Nobody is checked in at the moment." />
						<JumpFields idPrefix="ci" bind:jumpType={jtA} bind:extras={exA} {currency} count={Math.max(1, selChecked.length)} />
						{#if selChecked.length === 1}
							<Input label="Slot weight (kg)" name="weightKg" type="number" min="0" step="1" placeholder="From check-in" />
						{/if}
						{@render options(selChecked.length > 1, selChecked.length === 1)}
						{@render errorBox()}
						<Button type="submit" loading={busy} disabled={selChecked.length === 0} data-testid="add-checked">
							Add {selChecked.length > 1 ? `${selChecked.length} jumpers` : 'jumper'}
						</Button>
					</form>
				{:else if tab === 'members'}
					<form method="POST" action={formAction(page.url, 'addMembers')} class="flex flex-col gap-3" use:enhance={done(() => (selMembers = []))}>
						<input type="hidden" name="loadId" value={loadId} />
						<PeoplePicker idPrefix="mb" people={memberPeople} bind:selected={selMembers} />
						<JumpFields idPrefix="mb" bind:jumpType={jtB} bind:extras={exB} {currency} count={Math.max(1, selMembers.length)} />
						{#if selMembers.length === 1}
							<Input label="Slot weight (kg)" name="weightKg" type="number" min="0" step="1" placeholder="From profile" />
						{/if}
						{@render options(selMembers.length > 1, selMembers.length === 1)}
						{@render errorBox()}
						<Button type="submit" loading={busy} disabled={selMembers.length === 0}>Add {selMembers.length > 1 ? `${selMembers.length} jumpers` : 'jumper'}</Button>
					</form>
				{:else if tab === 'tandem'}
					<form method="POST" action={formAction(page.url, 'addTandem')} class="flex flex-col gap-3" use:enhance={done(() => ((passengerId = ''), (tiId = ''), (videoId = '')))}>
						<input type="hidden" name="loadId" value={loadId} />
						<fieldset>
							<legend class="mb-1.5 text-sm font-medium">1. Passenger</legend>
							<ul class="max-h-56 space-y-1 overflow-y-auto">
								{#each passengers as p (p.id)}
									<li>
										<label class={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors', passengerId === p.id ? 'border-primary/50 bg-primary/10' : 'border-border hover:border-border-strong')}>
											<input type="radio" name="passengerId" value={p.id} bind:group={passengerId} class="size-4 accent-[var(--dz-primary)]" />
											<span class="min-w-0 flex-1">
												<span class="block truncate font-medium">{p.name}</span>
												<span class="block truncate text-xs text-muted">
													{p.bookingTime ?? 'Walk-in'}{p.weightKg ? ` · ${p.weightKg} kg` : ''}{p.extras.length ? ` · ${p.extras.map((e) => SLOT_EXTRA_LABELS[e]).join(', ')}` : ''}
												</span>
											</span>
											<span class="shrink-0 text-xs font-medium tabular-nums">{formatMoney(p.totalMinor - p.depositMinor, currency)}</span>
										</label>
									</li>
								{:else}
									<li class="rounded-xl border border-dashed border-border-strong px-3 py-5 text-center text-sm text-muted">
										You have no tandem passengers ready for this day. <a href="/app/tandems" class="font-medium text-primary hover:underline">Tandem manager</a>
									</li>
								{/each}
							</ul>
						</fieldset>
						<Select
							label="2. Tandem instructor"
							name="instructorUserId"
							bind:value={tiId}
							placeholder="Choose TI…"
							options={tis.map((t) => ({ value: t.id, label: t.otherLoads?.length ? `${t.name} · ${alsoOnLabel(t.otherLoads)}` : t.name }))}
						/>
						<Select
							label="3. Outside video (optional)"
							name="videographerUserId"
							bind:value={videoId}
							options={[{ value: '', label: 'No outside video' }, ...videos.filter((v) => v.id !== tiId).map((v) => ({ value: v.id, label: v.otherLoads?.length ? `${v.name} · ${alsoOnLabel(v.otherLoads)}` : v.name }))]}
						/>
						{#if passenger}
							<div class="rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
								<div class="flex justify-between text-muted"><span>Tandem total</span><span class="tabular-nums">{formatMoney(passenger.totalMinor, currency)}</span></div>
								{#if passenger.depositMinor}<div class="flex justify-between text-muted"><span>Deposit paid</span><span class="tabular-nums">−{formatMoney(passenger.depositMinor, currency)}</span></div>{/if}
								<div class="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Due at manifest</span><span class="tabular-nums">{formatMoney(passenger.totalMinor - passenger.depositMinor, currency)}</span></div>
								<p class="mt-1 text-xs text-subtle">Uses {videoId ? 3 : 2} slots</p>
							</div>
						{/if}
						<input type="text" name="note" placeholder="Additional tandem note (optional)" class="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary" />
						<label class={box}><input type="checkbox" name="allowExpired" class={check} /><span>Allow expired staff membership</span></label>
						{@render errorBox()}
						<Button type="submit" loading={busy} disabled={!passengerId || !tiId} data-testid="add-tandem">Add tandem group</Button>
					</form>
				{:else if tab === 'team'}
					<form method="POST" action={formAction(page.url, 'addTeam')} class="flex flex-col gap-3" use:enhance={done(() => {})}>
						<input type="hidden" name="loadId" value={loadId} />
						<Select label="Team" name="teamId" placeholder={teams.length ? 'Choose team…' : 'No teams yet'} value="" options={teams.map((t) => ({ value: t.id, label: t.discipline ? `${t.name} · ${t.discipline}` : t.name }))} />
						<JumpFields idPrefix="tm" bind:jumpType={jtTeam} bind:extras={exTeam} {currency} />
						<label class={box}><input type="checkbox" name="includeStaff" checked class={check} /><span>Include the team's coach and video</span></label>
						{@render options(false, false)}
						{@render errorBox()}
						<Button type="submit" loading={busy} disabled={!teams.length}>Add whole team</Button>
					</form>
				{:else if tab === 'staff'}
					<form method="POST" action={formAction(page.url, 'addMembers')} class="flex flex-col gap-3" use:enhance={done(() => (selStaff = []))}>
						<input type="hidden" name="loadId" value={loadId} />
						<PeoplePicker idPrefix="st" people={staffPeople} bind:selected={selStaff} multiple={false} />
						<Select
							label="Working as"
							name="staffRole"
							bind:value={staffRole}
							options={[...Object.entries(SLOT_STAFF_ROLE_LABELS).map(([v, l]) => ({ value: v, label: l })), { value: '', label: 'Fun jumping (paying)' }]}
						/>
						<JumpFields idPrefix="st" bind:jumpType={jtStaff} extras={[]} staffRole={staffRole || null} noTandem={false} {currency} />
						<label class={box}><input type="checkbox" name="isLoadMaster" class={check} /><span>Load master (LM)</span></label>
						<label class={box}><input type="checkbox" name="allowExpired" class={check} /><span>Allow expired membership</span></label>
						{@render errorBox()}
						<Button type="submit" loading={busy} disabled={selStaff.length === 0}>Add staff jumper</Button>
					</form>
				{:else if tab === 'custom'}
					<form method="POST" action={formAction(page.url, 'addCustom')} class="flex flex-col gap-3" use:enhance={done(() => {})}>
						<input type="hidden" name="loadId" value={loadId} />
						<p class="text-sm text-muted">A jumper without an account (visitor, demo).</p>
						<Input label="Jumper name" name="displayName" required />
						<div class="grid grid-cols-2 gap-3">
							<Input label="Licence" name="licence" />
							<Input label="Slot weight (kg)" name="weightKg" type="number" min="1" step="1" required />
						</div>
						<Input label="Email" name="email" type="email" />
						<JumpFields idPrefix="cu" bind:jumpType={jtCustom} bind:extras={exCustom} {currency} />
						{@render errorBox()}
						<Button type="submit" loading={busy}>Create jumper slot</Button>
					</form>
				{/if}
		</div>
	</div>
</section>
