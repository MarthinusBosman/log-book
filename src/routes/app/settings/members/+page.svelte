<script lang="ts">
	import { enhance } from '$app/forms';
	import { Avatar, Badge, Button, Dialog, EmptyState, Icon, Input } from '#lib/ui/index.ts';
	import RoleChips from '#lib/components/staffadmin/RoleChips.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import { DROPZONE_ROLES, ROLE_LABELS, type DropzoneRole } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ROLE_HELP: Record<DropzoneRole, string> = {
		owner: 'Everything, incl. billing and owners',
		admin: 'Everything except owners',
		manifest: 'Loads, check-in, tandems, payments, reports',
		staff: 'Check-in and view loads',
		tandem_instructor: 'Tandem slots (has a colour)',
		aff_instructor: 'AFF slots',
		instructor: 'Student slots',
		coach: 'Coach slots',
		videographer: 'Video slots',
		rigger: 'Gear register and repacks',
		pilot: 'Flies loads',
		jumper: 'Member, no staff access'
	};

	let q = $state('');
	let roleFilter = $state<'' | DropzoneRole>('');
	let inviteOpen = $state(false);
	let editing = $state<(typeof data.members)[number] | null>(null);
	let removing = $state<(typeof data.members)[number] | null>(null);
	let pending = $state(false);

	const filtered = $derived(
		data.members.filter((m) => {
			const t = q.trim().toLowerCase();
			if (t && !`${m.name} ${m.email} ${m.licence ?? ''}`.toLowerCase().includes(t)) return false;
			if (roleFilter && !m.roles.some((r) => r.role === roleFilter)) return false;
			return true;
		})
	);
	const staffCount = $derived(data.members.filter((m) => m.roles.some((r) => r.role !== 'jumper')).length);
	const editRoles = $derived(new Set(editing?.roles.map((r) => r.role) ?? []));
	const tiColour = $derived(editing?.roles.find((r) => r.role === 'tandem_instructor')?.colour ?? '#22c55e');
	const canPick = (r: DropzoneRole) => r !== 'owner' || data.isOwner;
</script>

<svelte:head><title>Settings · Members</title></svelte:head>

{#snippet roleBoxes(selected: Set<DropzoneRole>)}
	<fieldset>
		<legend class="text-sm font-medium">Roles</legend>
		<p class="text-xs text-muted">People can hold several roles.</p>
		<div class="mt-3 grid gap-2 sm:grid-cols-2">
			{#each DROPZONE_ROLES as role (role)}
				<label
					class="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 hover:border-border-strong {canPick(role) ? '' : 'cursor-not-allowed opacity-50'}"
				>
					<input type="checkbox" name="roles" value={role} checked={selected.has(role)} disabled={!canPick(role)} class="mt-0.5 size-4 accent-[var(--dz-primary)]" />
					<span>
						<span class="block text-sm font-medium">{ROLE_LABELS[role]}</span>
						<span class="block text-xs text-muted">{ROLE_HELP[role]}</span>
					</span>
				</label>
			{/each}
		</div>
	</fieldset>
{/snippet}

<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
	<div class="relative flex-1">
		<Icon name="users" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
		<input
			bind:value={q}
			type="search"
			placeholder="Search name, email or licence"
			aria-label="Search members"
			class="h-10 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-subtle focus:border-primary focus:ring-4 focus:ring-primary/15"
		/>
	</div>
	<select
		bind:value={roleFilter}
		aria-label="Filter by role"
		class="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
	>
		<option value="">All roles</option>
		{#each DROPZONE_ROLES as r (r)}<option value={r}>{ROLE_LABELS[r]}</option>{/each}
	</select>
	<Button onclick={() => (inviteOpen = true)}><Icon name="plus" class="size-4" /> Invite</Button>
</div>

<p class="mt-4 text-sm text-muted">{data.members.length} {data.members.length === 1 ? 'member' : 'members'} · {staffCount} with staff roles</p>

<div class="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
	<ul class="divide-y divide-border">
		{#each filtered as m (m.userId)}
			<li class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
				<div class="flex min-w-0 flex-1 items-center gap-3">
					<Avatar name={m.name} src={m.avatar} size="sm" />
					<div class="min-w-0">
						<p class="truncate text-sm font-medium">
							{m.name}
							{#if m.userId === data.me}<span class="text-xs text-subtle">(you)</span>{/if}
							{#if m.status !== 'active'}<Badge tone="warning" class="ml-1 !py-0 !text-[10px]">{m.status}</Badge>{/if}
						</p>
						<p class="truncate text-xs text-muted">{m.email}{m.licence ? ` · ${m.licence}` : ''}</p>
					</div>
				</div>
				<RoleChips roles={m.roles} class="sm:max-w-[45%] sm:justify-end" />
				<div class="flex shrink-0 gap-1">
					<Button size="sm" variant="secondary" onclick={() => (editing = m)} aria-label="Edit roles for {m.name}">Roles</Button>
					{#if m.userId !== data.me}
						<Button size="sm" variant="ghost" onclick={() => (removing = m)} aria-label="Remove {m.name}">Remove</Button>
					{/if}
				</div>
			</li>
		{:else}
			<li class="p-6">
				<EmptyState title="No members match" description="Try another search or role filter." />
			</li>
		{/each}
	</ul>
</div>

<Dialog bind:open={inviteOpen} title="Invite a member" description="Existing accounts are added straight away; new people get an email to set a password." variant="right">
	<form
		method="POST"
		action="?/invite"
		class="space-y-4"
		use:enhance={toastEnhance({ reset: true, pending: (v) => (pending = v), onSuccess: () => (inviteOpen = false) })}
	>
		<Input label="Email" name="email" type="email" required autocomplete="off" />
		<Input label="Name" name="name" hint="Only needed for people without an account." autocomplete="off" />
		{@render roleBoxes(new Set<DropzoneRole>(['staff']))}
		<Button type="submit" class="w-full" loading={pending}>Send invite</Button>
	</form>
</Dialog>

<Dialog open={!!editing} onclose={() => (editing = null)} title={editing ? `Roles · ${editing.name}` : ''} description={editing?.email} variant="right">
	{#if editing}
		{#key editing.userId}
			<form
				method="POST"
				action="?/setRoles"
				class="space-y-4"
				use:enhance={toastEnhance({ pending: (v) => (pending = v), onSuccess: () => (editing = null) })}
			>
				<input type="hidden" name="userId" value={editing.userId} />
				{@render roleBoxes(editRoles)}
				<label class="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
					<span>
						<span class="block text-sm font-medium">Tandem instructor colour</span>
						<span class="block text-xs text-muted">Shown on the manifest board.</span>
					</span>
					<input type="color" name="colour" value={tiColour} class="h-9 w-14 cursor-pointer rounded-lg border border-border bg-surface" />
				</label>
				<Button type="submit" class="w-full" loading={pending}>Save roles</Button>
			</form>
		{/key}
	{/if}
</Dialog>

<Dialog open={!!removing} onclose={() => (removing = null)} title="Remove member?">
	{#if removing}
		<p class="text-sm text-muted">
			{removing.name} loses access to this dropzone and all roles. Their logbook, wallet history and past jumps stay intact.
		</p>
		<form
			method="POST"
			action="?/remove"
			class="mt-5 flex justify-end gap-2"
			use:enhance={toastEnhance({ onSuccess: () => (removing = null) })}
		>
			<input type="hidden" name="userId" value={removing.userId} />
			<Button variant="ghost" onclick={() => (removing = null)}>Cancel</Button>
			<Button type="submit" variant="danger">Remove</Button>
		</form>
	{/if}
</Dialog>
