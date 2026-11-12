<script lang="ts">
	import { enhance } from '$app/forms';
	import { Avatar, Badge, Button, Card, Icon, Input, Select, cn, toast } from '#lib/ui/index.ts';
	import { ASSOCIATIONS, ASSOCIATION_LABELS, RATING_BODIES, type RatingBody } from '#lib/domain/constants.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import Toggle from '#lib/components/jumper/Toggle.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { fmtDate } from '#lib/components/jumper/format.ts';
	import ImageUpload from '#lib/components/ImageUpload.svelte';
	import { IMAGE_PRESETS } from '#lib/client/resize-image.ts';
	import PasaCard, { type PasaPreviewVM } from '#lib/components/memberships/PasaCard.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.profile);
	const f = $derived(form as { action?: string; message?: string; success?: string } | null);
	const err = (a: string) => (f?.action === a ? (f.message ?? null) : null);
	let busy = $state<string | null>(null);
	const pasaLocked = $derived(data.pasa?.status === 'verified' || data.pasa?.status === 'lapsed');
	const pasaPreview = $derived(f?.action === 'pasa' ? ((form as { preview?: PasaPreviewVM } | null)?.preview ?? null) : null);
	const lockHint = 'From PASA · disconnect to edit';
	let ratingBody = $state<RatingBody>('pasa');

	const BODY_LABELS: Record<RatingBody, string> = { pasa: 'PASA', uspa: 'USPA', other: 'Other' };
	const tabs = [
		{ id: 'info', label: 'Info' },
		{ id: 'credentials', label: 'Credentials' },
		{ id: 'security', label: 'Security' }
	];
	const mTone = { none: 'neutral', valid: 'success', expiring: 'warning', expired: 'danger' } as const;
	const mLabel = $derived(
		data.membership.status === 'none'
			? 'Not set'
			: data.membership.status === 'expired'
				? `Expired ${fmtDate(data.membership.expiry)}`
				: data.membership.status === 'expiring'
					? `Expires in ${data.membership.daysLeft} days`
					: `Valid until ${fmtDate(data.membership.expiry)}`
	);

	const submit = (name: string, reset = false) => () => {
		busy = name;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset });
			busy = null;
			const msg = (result.data as { success?: string } | undefined)?.success;
			if (result.type === 'success' && msg) toast.success(msg);
		};
	};
	const ratingStatus = (exp: string | null) => {
		if (!exp) return null;
		const d = Math.round((Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${data.today}T00:00:00Z`)) / 86_400_000);
		return d < 0 ? { tone: 'danger' as const, label: 'Expired' } : d <= 30 ? { tone: 'warning' as const, label: `${d} days left` } : { tone: 'success' as const, label: `Until ${fmtDate(exp)}` };
	};
</script>

<svelte:head><title>Profile</title></svelte:head>

<PageHeader title="Profile" icon="user" description="Your details, credentials and account." />

<div class="mb-6 flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 sm:flex-row sm:items-center" data-testid="profile-card">
	<div class="relative shrink-0 self-start sm:self-center">
		{#if p.avatar}
			<img src={p.avatar} alt={p.name} class="size-20 rounded-full object-cover ring-2 ring-border sm:size-24" data-testid="profile-avatar" />
		{:else}
			<Avatar name={p.name} size="lg" class="size-20 text-xl sm:size-24 sm:text-2xl" />
		{/if}
	</div>
	<div class="min-w-0 flex-1">
		<h2 class="truncate text-xl font-semibold tracking-tight">{p.name}</h2>
		<p class="truncate text-sm text-muted">{p.email}</p>
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#if p.licence}<Badge tone="brand">Licence {p.licence}</Badge>{/if}
			{#if p.association}<Badge tone={mTone[data.membership.status]}>{ASSOCIATION_LABELS[p.association]} · {mLabel}</Badge>{/if}
		</div>
		<ImageUpload
			class="mt-3"
			action="?/avatar"
			removeAction="?/removeAvatar"
			field="avatar"
			hasImage={!!p.avatar}
			noun="photo"
			testid="avatar"
			hint={p.avatar ? 'Shown to your dropzones on manifest, teams and staff lists. JPG, PNG or WebP.' : 'Add a photo so manifest and your team can recognise you. JPG, PNG or WebP.'}
			resize={IMAGE_PRESETS.avatar}
			error={err('avatar')}
			success={f?.action === 'avatar' ? (f.success ?? null) : null}
		/>
	</div>
</div>

<nav class="mb-6 scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface-2/60 p-1" aria-label="Profile sections">
	{#each tabs as t (t.id)}
		<a href="?tab={t.id}" class={cn('inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap', data.tab === t.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')} aria-current={data.tab === t.id ? 'page' : undefined} data-sveltekit-reset="false">{t.label}</a>
	{/each}
</nav>

{#if data.tab === 'info'}
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<Card class="lg:col-span-2" title="Personal details">
			<form method="POST" action="?/info" class="space-y-4" use:enhance={submit('info')} data-testid="info-form">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Input label="Full name" name="name" value={p.name} required autocomplete="name" />
					<Input label="Email" value={p.email} readonly disabled hint="Contact support to change your email" />
					<Input label="Phone number" name="phone" type="tel" value={p.phone ?? ''} autocomplete="tel" />
					<Input label="Date of birth" name="dob" type="date" value={p.dob ?? ''} max={data.today} />
				</div>
				<Input label="Address" name="address" value={p.address ?? ''} autocomplete="street-address" />
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Input label="Emergency contact name" name="emergencyName" value={p.emergencyName ?? ''} />
					<Input label="Emergency contact number" name="emergencyPhone" type="tel" value={p.emergencyPhone ?? ''} />
				</div>
				<Toggle name="marketingOptIn" label="Marketing promotions" hint="Receive email or in-app offers from your dropzones. Strictly no spam." checked={p.marketingOptIn} />
				<FormAlert message={err('info')} />
				<div class="flex justify-end"><Button type="submit" loading={busy === 'info'}>Save changes</Button></div>
			</form>
		</Card>
		<aside class="space-y-4">
			<Card title="Your data" description="Bring your history with you — and take it anywhere.">
				<ul class="space-y-2 text-sm">
					<li>
						<a href="/app/import" class="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:border-border-strong" data-testid="import-link">
							<span class="flex items-center gap-3"><span class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><JIcon name="download" class="size-4" /></span><span><span class="block font-medium">Import from Jump Master</span><span class="text-muted">Logbook, gear and profile</span></span></span>
							<JIcon name="chevronRight" class="size-4 text-muted" />
						</a>
					</li>
					<li>
						<a href="/app/settings/linked-accounts" class="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:border-border-strong">
							<span class="flex items-center gap-3"><span class="grid size-9 place-items-center rounded-lg bg-surface-2 text-muted"><JIcon name="link" class="size-4" /></span><span><span class="block font-medium">Linked accounts</span><span class="text-muted">Connected services</span></span></span>
							<JIcon name="chevronRight" class="size-4 text-muted" />
						</a>
					</li>
					<li>
						<a href="/app/export" class="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:border-border-strong" data-testid="export-link">
							<span class="flex items-center gap-3"><span class="grid size-9 place-items-center rounded-lg bg-surface-2 text-muted"><JIcon name="upload" class="size-4" /></span><span><span class="block font-medium">Export your data</span><span class="text-muted">Logbook CSV and full JSON backup</span></span></span>
							<JIcon name="chevronRight" class="size-4 text-muted" />
						</a>
					</li>
				</ul>
			</Card>
		</aside>
	</div>
{:else if data.tab === 'credentials'}
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
		<Card class="lg:col-span-3" title="Membership & licence">
			<form method="POST" action="?/credentials" class="space-y-4" use:enhance={submit('credentials')} data-testid="credentials-form">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Select label="Skydive association" name="association" value={p.association ?? ''} disabled={pasaLocked} options={[{ value: '', label: 'Not set' }, ...ASSOCIATIONS.map((a) => ({ value: a, label: ASSOCIATION_LABELS[a] }))]} />
					<Input label="Association number" name="associationNumber" value={p.associationNumber ?? ''} readonly={pasaLocked} hint={pasaLocked ? lockHint : undefined} />
					<div>
						<Input label="Membership expiry" name="associationExpiry" type="date" value={p.associationExpiry ?? ''} readonly={pasaLocked} />
						<p class="mt-1.5"><Badge tone={mTone[data.membership.status]} dot>{mLabel}</Badge>{#if p.associationVerified}<Badge tone="success" class="ml-1"><JIcon name="badgeCheck" class="size-3.5" /> Verified</Badge>{/if}</p>
					</div>
					<Input label="Licence number" name="licence" value={p.licence ?? ''} placeholder="e.g. C-12345" readonly={pasaLocked} hint={pasaLocked ? lockHint : 'Needed to sign other jumpers’ logbooks'} />
					<Input label="Number of jumps before this logbook" name="declaredJumpCount" type="number" inputmode="numeric" min="0" value={p.declaredJumpCount} hint="Your next logbook number continues from this" />
				</div>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Input label="Body weight (kg)" name="weightKg" type="number" inputmode="decimal" step="0.5" min="30" max="250" value={p.weightKg ?? ''} />
					<Input label="Exit weight with gear (kg)" name="loadingWeightKg" type="number" inputmode="decimal" step="0.5" min="30" max="250" value={p.loadingWeightKg ?? ''} hint="Used for manifest and wing loading" />
				</div>
				<FormAlert message={err('credentials')} />
				<div class="flex justify-end"><Button type="submit" loading={busy === 'credentials'}>Save credentials</Button></div>
			</form>
		</Card>

		<div class="min-w-0 space-y-6 lg:col-span-2 lg:self-start">
		{#if !p.association || p.association.startsWith('pasa')}
			<PasaCard check={data.pasa} preview={pasaPreview} error={err('pasa')} profileName={p.name} defaultNumber={p.association?.startsWith('pasa') ? p.associationNumber : null} today={data.today} />
		{/if}
		<Card title="Ratings" description="Instructor, coach and other ratings with expiry." padded={false}>
			<ul class="divide-y divide-border" data-testid="ratings">
				{#each data.ratings as r (r.id)}
					{@const st = ratingStatus(r.expiresOn)}
					<li class="flex items-center gap-3 px-5 py-3 text-sm">
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">{r.rating}</span>
							<span class="text-xs text-muted">{BODY_LABELS[r.body]}{r.verified ? ' · verified' : ''}</span>
						</span>
						{#if st}<Badge tone={st.tone}>{st.label}</Badge>{:else}<Badge>No expiry</Badge>{/if}
						{#if !r.verified}
							<form method="POST" action="?/removeRating" use:enhance={submit('rating')}>
								<input type="hidden" name="id" value={r.id} />
								<button type="submit" class="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger" aria-label="Remove {r.rating}"><JIcon name="x" class="size-4" /></button>
							</form>
						{/if}
					</li>
				{:else}
					<li class="px-5 py-4 text-sm text-muted">No ratings added.</li>
				{/each}
			</ul>
			<form method="POST" action="?/addRating" class="space-y-3 border-t border-border p-5" use:enhance={submit('rating', true)} data-testid="rating-form">
				<div class="grid grid-cols-[auto_1fr] gap-2">
					<select name="body" bind:value={ratingBody} class="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary" aria-label="Association">
						{#each RATING_BODIES as b (b)}<option value={b}>{BODY_LABELS[b]}</option>{/each}
					</select>
					<input name="rating" list="known-ratings" required placeholder="Rating, e.g. Coach" class="h-10 min-w-0 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary" aria-label="Rating" />
					<datalist id="known-ratings">{#each data.knownRatings[ratingBody] as k (k)}<option value={k}></option>{/each}</datalist>
				</div>
				<div class="flex gap-2">
					<input name="expiresOn" type="date" class="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary" aria-label="Expiry date" />
					<Button type="submit" variant="secondary" loading={busy === 'rating'}><Icon name="plus" class="size-4" /> Add</Button>
				</div>
				<FormAlert message={err('rating')} />
			</form>
		</Card>
		</div>
	</div>
{:else}
	<div class="max-w-xl">
		<Card title="Change password" description="Other devices will be signed out.">
			<form method="POST" action="?/password" class="space-y-4" use:enhance={submit('password', true)} data-testid="password-form">
				<Input label="Current password" name="current" type="password" autocomplete="current-password" required />
				<Input label="New password" name="next" type="password" autocomplete="new-password" minlength={8} required />
				<Input label="Confirm new password" name="confirm" type="password" autocomplete="new-password" required />
				<FormAlert message={err('password')} />
				<div class="flex justify-end"><Button type="submit" loading={busy === 'password'}>Change password</Button></div>
			</form>
		</Card>
		<form method="POST" action="/logout" class="mt-4">
			<Button type="submit" variant="ghost"><JIcon name="logOut" class="size-4" /> Log out</Button>
		</form>
	</div>
{/if}
