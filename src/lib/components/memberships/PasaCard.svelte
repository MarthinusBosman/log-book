<script lang="ts" module>
	export type PasaCheckVM = {
		status: 'verified' | 'needs_review' | 'lapsed' | 'rejected';
		number: string;
		memberName: string | null;
		licence: string | null;
		dropzone: string | null;
		ratings: { rating: string; value: string | null }[];
		current: boolean;
		expiry: string | null;
		checkedAt: number;
		reviewedAt: number | null;
	};
	export type PasaPreviewVM = {
		number: string;
		name: string;
		licence: string | null;
		dropzone: string | null;
		ratings: { rating: string; value: string | null }[];
		current: boolean | null;
		expiry: string | null;
		nameMatch: 'match' | 'mismatch';
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, cn, toast } from '#lib/ui/index.ts';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import { fmtDate } from '#lib/components/jumper/format.ts';

	type Props = {
		check: PasaCheckVM | null;
		preview?: PasaPreviewVM | null;
		error?: string | null;
		profileName: string;
		defaultNumber?: string | null;
		today: string;
		class?: string;
	};
	let { check, preview = null, error = null, profileName, defaultNumber = null, today, class: className }: Props = $props();

	let busy = $state<string | null>(null);
	const submit = (name: string) => () => {
		busy = name;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = null;
			const msg = (result.data as { success?: string } | undefined)?.success;
			if (result.type === 'success' && msg) toast.success(msg);
		};
	};

	const linked = $derived(check && (check.status === 'verified' || check.status === 'lapsed') ? check : null);
	const expired = $derived(!!linked && (!linked.current || (!!linked.expiry && linked.expiry < today)));
	const fmtTs = (t: number) => new Date(t).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
	const row = 'flex items-baseline justify-between gap-3 py-2';
</script>

{#snippet details(m: { name: string | null; number: string; licence: string | null; dropzone: string | null; ratings: { rating: string; value: string | null }[] })}
	<dl class="divide-y divide-border/70 text-sm">
		<div class={row}><dt class="text-muted">Name</dt><dd class="text-right font-medium" data-testid="pasa-name">{m.name ?? '—'}</dd></div>
		<div class={row}><dt class="text-muted">PASA no.</dt><dd class="font-medium tabular-nums">{m.number}</dd></div>
		<div class={row}><dt class="text-muted">Licence</dt><dd class="font-medium">{m.licence ?? '—'}</dd></div>
		<div class={row}><dt class="text-muted">Dropzone</dt><dd class="text-right">{m.dropzone ?? '—'}</dd></div>
		<div class="py-2">
			<dt class="text-muted">Ratings</dt>
			<dd class="mt-1.5 flex flex-wrap gap-1">
				{#each m.ratings as r (r.rating)}
					<Badge tone="brand">{r.rating}{#if r.value}<span class="font-normal opacity-75">· {r.value}</span>{/if}</Badge>
				{:else}
					<span class="text-sm text-subtle">No current ratings for this member</span>
				{/each}
			</dd>
		</div>
	</dl>
{/snippet}

{#snippet lookupForm(label: string, value: string | null)}
	<form method="POST" action="?/pasaLookup&tab=credentials" class="flex gap-2" use:enhance={submit('lookup')} data-testid="pasa-lookup-form">
		<label class="sr-only" for="pasa-number">PASA number</label>
		<input
			id="pasa-number"
			name="number"
			inputmode="numeric"
			autocomplete="off"
			placeholder="PASA number, e.g. 4568"
			value={value ?? ''}
			required
			class="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm tabular-nums outline-none focus:border-primary"
		/>
		<Button type="submit" loading={busy === 'lookup'}><JIcon name="search" class="size-4" /> {label}</Button>
	</form>
{/snippet}

<section class={cn('overflow-hidden rounded-2xl border border-border bg-surface', className)} data-testid="pasa-card" data-state={preview ? 'preview' : (check?.status ?? 'none')}>
	<header class="flex items-start gap-3 border-b border-border px-5 py-4">
		<span
			class={cn(
				'grid size-10 shrink-0 place-items-center rounded-xl',
				preview ? 'bg-primary/10 text-primary' : linked && !expired ? 'bg-success/10 text-success' : expired ? 'bg-danger/10 text-danger' : check?.status === 'needs_review' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
			)}
		>
			<JIcon name={linked && !expired ? 'badgeCheck' : expired || check?.status === 'needs_review' ? 'alert' : 'link'} class="size-5" />
		</span>
		<div class="min-w-0 flex-1">
			<h3 class="font-semibold tracking-tight">
				{#if preview}PASA member information{:else if linked && !expired}Connected to PASA{:else if expired}PASA membership expired{:else if check?.status === 'needs_review'}Waiting for staff confirmation{:else}Verify with PASA{/if}
			</h3>
			<p class="text-sm text-muted">
				{#if preview}
					Check these are your details, then connect.
				{:else if linked && !expired}
					Valid until {fmtDate(linked.expiry)} · checked {fmtTs(linked.checkedAt)}
				{:else if expired}
					Your membership to PASA has expired. If you have paid, please reconnect to PASA with the app again.
				{:else if check?.status === 'needs_review'}
					The name on PASA member {check.number} doesn’t match your profile, so staff at your dropzone need to confirm it’s you.
				{:else if check?.status === 'rejected'}
					Staff couldn’t match PASA member {check.number} to you. Check the number and try again.
				{:else}
					Fill in your membership, licence and ratings from PASA’s members directory, verified for every dropzone.
				{/if}
			</p>
		</div>
		{#if linked && !expired}<Badge tone="success" dot>Verified</Badge>{:else if expired}<Badge tone="danger" dot>Expired</Badge>{:else if check?.status === 'needs_review'}<Badge tone="warning" dot>Pending</Badge>{/if}
	</header>

	<div class="space-y-4 px-5 py-4">
		{#if preview}
			{@render details(preview)}
			<div class="flex flex-wrap items-center gap-2 text-sm">
				{#if preview.current}
					<Badge tone="success" dot>Current member</Badge><span class="text-muted">valid until {fmtDate(preview.expiry)}</span>
				{:else}
					<Badge tone="danger" dot>Not on the current members list</Badge><span class="text-muted">expired {fmtDate(preview.expiry)}</span>
				{/if}
			</div>
			{#if preview.nameMatch !== 'match'}
				<p class="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" data-testid="pasa-mismatch">
					<JIcon name="alert" class="mt-px size-4 shrink-0" />
					<span>PASA has this member as <strong>{preview.name}</strong>, your profile says <strong>{profileName}</strong>. You can still connect; a staff member will confirm it before it counts as verified.</span>
				</p>
			{/if}
			<form method="POST" action="?/pasaConnect&tab=credentials" class="flex flex-wrap gap-2" use:enhance={submit('connect')}>
				<input type="hidden" name="number" value={preview.number} />
				<Button type="submit" loading={busy === 'connect'} data-testid="pasa-connect">
					<JIcon name="badgeCheck" class="size-4" />
					{preview.nameMatch === 'match' ? 'Confirm & connect' : 'Ask staff to confirm'}
				</Button>
				<Button href="?tab=credentials" variant="ghost">Not me</Button>
			</form>
		{:else if linked}
			{@render details({ name: linked.memberName, number: linked.number, licence: linked.licence, dropzone: linked.dropzone, ratings: linked.ratings })}
			<div class="flex flex-wrap gap-2">
				<form method="POST" action="?/pasaConnect&tab=credentials" use:enhance={submit('connect')}>
					<input type="hidden" name="number" value={linked.number} />
					<Button type="submit" variant={expired ? 'primary' : 'secondary'} size="sm" loading={busy === 'connect'} data-testid="pasa-recheck">
						<JIcon name="history" class="size-4" /> {expired ? 'Reconnect to PASA' : 'Check again'}
					</Button>
				</form>
				<form method="POST" action="?/pasaDisconnect&tab=credentials" use:enhance={submit('disconnect')}>
					<Button type="submit" variant="ghost" size="sm" loading={busy === 'disconnect'}><JIcon name="x" class="size-4" /> Disconnect</Button>
				</form>
			</div>
		{:else if check?.status === 'needs_review'}
			{@render details({ name: check.memberName, number: check.number, licence: check.licence, dropzone: check.dropzone, ratings: check.ratings })}
			<form method="POST" action="?/pasaDisconnect&tab=credentials" use:enhance={submit('disconnect')}>
				<Button type="submit" variant="ghost" size="sm" loading={busy === 'disconnect'}><JIcon name="x" class="size-4" /> Cancel request</Button>
			</form>
		{:else}
			{@render lookupForm('Look up', check?.number ?? defaultNumber)}
		{/if}
		<FormAlert message={error} />
		<p class="text-xs text-subtle">
			Looked up in PASA’s public <a href="https://www.para.co.za/Members" target="_blank" rel="noopener noreferrer" class="underline hover:text-fg">members directory</a>. PASA memberships run to 31 March;
			we re-check daily near expiry. If PASA can’t be reached, fill in the membership form yourself; staff can verify it.
		</p>
	</div>
</section>
