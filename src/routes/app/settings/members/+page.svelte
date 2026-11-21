<script lang="ts">
	import NoJsOutcome from '#lib/components/staffadmin/NoJsOutcome.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { readChoice, readQuery } from '#lib/components/staffadmin/list-view.ts';
	import { syncViewToUrl } from '#lib/components/staffadmin/url-sync.svelte.ts';
	import { newDialogHref, openInPlace, viewParamsHref, wantsNewDialog } from '#lib/components/staffadmin/open-dialog.ts';
	import { Avatar, Badge, Button, Dialog, EmptyState, Icon, Input } from '#lib/ui/index.ts';
	import RoleChips from '#lib/components/staffadmin/RoleChips.svelte';
	import { roleLock } from '#lib/components/staffadmin/role-lock.ts';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import { DROPZONE_ROLES, ROLE_LABELS, type DropzoneRole } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ROLE_HELP: Record<DropzoneRole, string> = {
		owner: 'Everything, incl. payment settings and owners',
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

	// Search text and role filter follow the URL (?q=, ?role=): reload and shared links keep them.
	let q = $state(readQuery(page.url.searchParams));
	let roleFilter = $state<'' | DropzoneRole>(readChoice(page.url.searchParams, 'role', DROPZONE_ROLES));
	let inviteOpen = $state(wantsNewDialog(page.url.searchParams));
	// Roles / Remove are links too (?edit=<userId>, ?remove=<userId>): they open the dialog
	// before hydration and without JS; once hydrated they open in place and the URL follows.
	const memberParam = (key: string) => {
		const id = page.url.searchParams.get(key);
		return id && data.members.some((m) => m.userId === id) ? id : null;
	};
	let editingId = $state<string | null>(memberParam('edit'));
	let removingId = $state<string | null>(memberParam('remove'));
	syncViewToUrl(() => ({ q: q.trim(), role: roleFilter, new: inviteOpen ? '1' : null, edit: editingId, remove: removingId }));
	const openInvite = openInPlace(() => ((inviteOpen = true), (editingId = null), (removingId = null)));
	const editing = $derived(data.members.find((m) => m.userId === editingId) ?? null);
	const removing = $derived(data.members.find((m) => m.userId === removingId) ?? null);
	const href = (set: Record<string, string | null>) => viewParamsHref(page.url, set);
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
	const notSignedUp = $derived(data.members.filter((m) => !m.hasLogin).length);
	const editRoles = $derived(new Set(editing?.roles.map((r) => r.role) ?? []));
	const tiColour = $derived(editing?.roles.find((r) => r.role === 'tandem_instructor')?.colour ?? '#22c55e');
	const NONE = new Set<DropzoneRole>();
</script>

<svelte:head><title>Settings · Members</title></svelte:head>

<NoJsOutcome class="mb-4" />
{#snippet roleBoxes(selected: Set<DropzoneRole>, isSelf: boolean, held: ReadonlySet<DropzoneRole>)}
	<fieldset>
		<legend class="text-sm font-medium">Roles</legend>
		<p class="text-xs text-muted">People can hold several roles.</p>
		<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
			{#each DROPZONE_ROLES as role (role)}
				{@const lock = roleLock(role, { isOwner: data.isOwner, isSelf, has: held })}
				<label
					class="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 {lock ? 'cursor-not-allowed' : 'cursor-pointer hover:border-border-strong'}"
					data-locked={lock ? '' : undefined}
				>
					<input type="checkbox" name="roles" value={role} checked={selected.has(role)} disabled={!!lock} class="mt-0.5 size-4 accent-[var(--dz-primary)]" />
					<!-- A disabled box isn't posted: keep a held, locked role so Save doesn't read it as dropped. -->
					{#if lock && selected.has(role)}<input type="hidden" name="roles" value={role} />{/if}
					<span>
						<span class="block text-sm font-medium {lock ? 'opacity-60' : ''}">{ROLE_LABELS[role]}</span>
						<span class="block text-xs text-muted {lock ? 'opacity-60' : ''}">{ROLE_HELP[role]}</span>
						{#if lock}<span class="mt-0.5 block text-xs font-medium text-muted" data-testid="role-lock">{lock}</span>{/if}
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
		class="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
	>
		<option value="">All roles</option>
		{#each DROPZONE_ROLES as r (r)}<option value={r}>{ROLE_LABELS[r]}</option>{/each}
	</select>
	<Button href={newDialogHref(page.url, ['edit', 'remove'])} onclick={openInvite}><Icon name="plus" class="size-4" /> Invite</Button>
</div>

<p class="mt-4 text-sm text-muted">
	{data.members.length} {data.members.length === 1 ? 'member' : 'members'} · {staffCount} with staff roles{#if notSignedUp}{` · ${notSignedUp} not signed up yet`}{/if}
</p>

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
							{#if !m.hasLogin}<Badge class="ml-1 !py-0 !text-[10px]">Not signed up</Badge>{/if}
						</p>
						<p class="truncate text-xs text-muted">{m.email}{m.licence ? ` · ${m.licence}` : ''}</p>
					</div>
				</div>
				<RoleChips roles={m.roles} class="sm:max-w-[45%] sm:justify-end" />
				<div class="flex shrink-0 flex-wrap gap-1">
					{#if !m.hasLogin}
						<form method="POST" action="?/resendInvite" use:enhance={toastEnhance()}>
							<input type="hidden" name="userId" value={m.userId} />
							<Button type="submit" size="sm" variant="ghost" aria-label="Resend invite to {m.name}">Resend invite</Button>
						</form>
					{/if}
					<Button
						size="sm"
						variant="secondary"
						href={href({ edit: m.userId, remove: null, new: null })}
						onclick={openInPlace(() => ((editingId = m.userId), (removingId = null), (inviteOpen = false)))}
						aria-label="Edit roles for {m.name}">Roles</Button
					>
					{#if m.userId !== data.me}
						<Button
							size="sm"
							variant="ghost"
							href={href({ remove: m.userId, edit: null, new: null })}
							onclick={openInPlace(() => ((removingId = m.userId), (editingId = null), (inviteOpen = false)))}
							aria-label="Remove {m.name}">Remove</Button
						>
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
		{@render roleBoxes(new Set<DropzoneRole>(['staff']), false, NONE)}
		<Button type="submit" class="w-full" loading={pending}>Send invite</Button>
	</form>
</Dialog>

<Dialog open={!!editing} onclose={() => (editingId = null)} title={editing ? `Roles · ${editing.name}` : ''} description={editing?.email} variant="right">
	{#if editing}
		{#key editing.userId}
			<form
				method="POST"
				action="?/setRoles"
				class="space-y-4"
				use:enhance={toastEnhance({ pending: (v) => (pending = v), onSuccess: () => (editingId = null) })}
			>
				<input type="hidden" name="userId" value={editing.userId} />
				{@render roleBoxes(editRoles, editing.userId === data.me, editRoles)}
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

<Dialog open={!!removing} onclose={() => (removingId = null)} title="Remove member?">
	{#if removing}
		<p class="text-sm text-muted">
			{removing.name} loses access to this dropzone and all roles. Their logbook, wallet history and past jumps stay intact.
		</p>
		<form
			method="POST"
			action="?/remove"
			class="mt-5 flex justify-end gap-2"
			use:enhance={toastEnhance({ onSuccess: () => (removingId = null) })}
		>
			<input type="hidden" name="userId" value={removing.userId} />
			<Button variant="ghost" href={href({ remove: null })} onclick={openInPlace(() => (removingId = null))}>Cancel</Button>
			<Button type="submit" variant="danger">Remove</Button>
		</form>
	{/if}
</Dialog>
