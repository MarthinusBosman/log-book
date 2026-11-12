<script lang="ts">
	import MembershipWarning from '#lib/components/memberships/MembershipWarning.svelte';
	import { enhance } from '$app/forms';
	import { formatMoney } from '#lib/domain/constants.ts';
	import { Badge, Button, Card, EmptyState, Icon, Input, Select, toast } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import Toggle from '#lib/components/jumper/Toggle.svelte';
	import LoadCard from '#lib/components/jumper/LoadCard.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { fmtTime } from '#lib/components/jumper/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state<string | null>(null);
	let editing = $state(false);

	const initialDz = $derived(data.choices.find((c) => c.slug === data.preferred)?.id ?? data.choices[0]?.id ?? '');
	const err = $derived(form && 'message' in form ? (form as { action?: string; message?: string; loadId?: string }) : null);
	const errFor = (loadId: string) => (err && err.loadId === loadId ? err : null);
	const generalError = $derived(err && !err.loadId ? err.message : null);

	const submit = (name: string) => () => {
		busy = name;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = null;
			if (result.type === 'success') {
				const msg = (result.data as { success?: string } | undefined)?.success;
				if (msg) toast.success(msg);
				editing = false;
			}
		};
	};
</script>

<svelte:head><title>Check-in</title></svelte:head>

<PageHeader title="Check-in" icon="checkin" description={data.checkin ? `Manifest yourself at ${data.checkin.dropzone.name}` : 'Check in at the dropzone, then join a load'} />

{#if !data.checkin}
	<div class="mx-auto max-w-xl">
		{#if data.choices.length === 0}
			<EmptyState title="No dropzones yet" description="There are no dropzones listed on this instance yet.">
				{#snippet icon()}<JIcon name="mapPin" class="size-6" />{/snippet}
			</EmptyState>
		{:else}
			<Card>
				<form method="POST" action="?/checkin" class="space-y-5" use:enhance={submit('checkin')} data-testid="checkin-form">
					<div class="flex items-center gap-4">
						<span class="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon name="checkin" class="size-7" /></span>
						<div>
							<h2 class="text-lg font-semibold tracking-tight">Check in for today</h2>
							<p class="text-sm text-muted">Manifest sees you’re on site and you can join loads.</p>
						</div>
					</div>
					<Select
						label="Dropzone"
						name="dropzoneId"
						value={initialDz}
						options={data.choices.map((c) => ({ value: c.id, label: c.rank === 0 ? `★ ${c.name}` : c.name }))}
					/>
					<Input
						label="Exit weight (kg)"
						name="weightKg"
						type="number"
						inputmode="decimal"
						min="30"
						max="200"
						step="0.5"
						value={data.me.weightKg ?? ''}
						hint="You plus your gear. Used for the aircraft weight."
					/>
					<Toggle name="gearRental" label="I need rental gear" hint="Adds gear rental to your jumps today." />
					<FormAlert message={generalError} />
					<Button type="submit" size="lg" class="w-full" loading={busy === 'checkin'} data-testid="checkin-submit">
						<Icon name="checkin" class="size-5" /> Check in now
					</Button>
					<p class="text-center text-sm text-muted">
						Not listed? <a href="/app/dropzones" class="font-medium text-primary hover:underline">Browse dropzones</a>
					</p>
				</form>
			</Card>
		{/if}
	</div>
{:else}
	{@const c = data.checkin}
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<aside class="space-y-4 lg:sticky lg:top-6 lg:self-start">
			{#if data.switchTo}
				<form method="POST" action="?/checkin" class="rounded-2xl border border-primary/30 bg-primary/5 p-5" use:enhance={submit('switch')} data-testid="switch-checkin">
					<input type="hidden" name="dropzoneId" value={data.switchTo.id} />
					<input type="hidden" name="weightKg" value={c.weightKg ?? ''} />
					{#if c.gearRental}<input type="hidden" name="gearRental" value="on" />{/if}
					<p class="font-semibold">Jumping at {data.switchTo.name} instead?</p>
					<p class="mt-1 text-sm text-muted">Checking in there checks you out of {c.dropzone.name}.</p>
					<div class="mt-4 flex flex-wrap gap-2">
						<Button type="submit" size="sm" loading={busy === 'switch'}><Icon name="checkin" class="size-4" /> Check in at {data.switchTo.name}</Button>
						<Button size="sm" variant="ghost" href="/app/check-in">Stay here</Button>
					</div>
				</form>
			{/if}
			<div class="rounded-2xl border border-success/30 bg-success/5 p-5" data-testid="checked-in">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-xs font-medium tracking-wider text-success uppercase">Checked in</p>
						<h2 class="mt-1 truncate text-xl font-semibold tracking-tight">{c.dropzone.name}</h2>
						<p class="text-sm text-muted">since {fmtTime(c.checkedInAt)}</p>
					</div>
					{#if c.verified}<Badge tone="success"><JIcon name="badgeCheck" class="size-3.5" /> Verified</Badge>{/if}
				</div>
				<dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
					<div class="rounded-xl bg-surface/60 p-3">
						<dt class="text-xs text-muted">Exit weight</dt>
						<dd class="font-medium tabular-nums">{c.weightKg ? `${c.weightKg} kg` : '—'}</dd>
					</div>
					<div class="rounded-xl bg-surface/60 p-3">
						<dt class="text-xs text-muted">Gear</dt>
						<dd class="font-medium">{c.gearRental ? 'Rental' : 'Own rig'}</dd>
					</div>
				</dl>
				{#if editing}
					<form method="POST" action="?/update" class="mt-4 space-y-3" use:enhance={submit('update')}>
						<Input label="Exit weight (kg)" name="weightKg" type="number" inputmode="decimal" step="0.5" value={c.weightKg ?? ''} />
						<Toggle name="gearRental" label="Rental gear" checked={c.gearRental} />
						<div class="flex gap-2">
							<Button type="submit" size="sm" loading={busy === 'update'}>Save</Button>
							<Button size="sm" variant="ghost" onclick={() => (editing = false)}>Cancel</Button>
						</div>
					</form>
				{/if}
				<div class="mt-4 flex gap-2">
					{#if !editing}<Button size="sm" variant="secondary" onclick={() => (editing = true)}><JIcon name="edit" class="size-4" /> Edit</Button>{/if}
					<form
						method="POST"
						action="?/checkout"
						use:enhance={(e) => {
							if (!confirm(`Check out of ${c.dropzone.name}?`)) return e.cancel();
							return submit('checkout')();
						}}
					>
						<Button type="submit" size="sm" variant="ghost" loading={busy === 'checkout'} data-testid="checkout">
							<JIcon name="logOut" class="size-4" /> Check out
						</Button>
					</form>
				</div>
			</div>

			{#if data.membershipWarning}<MembershipWarning label={data.membershipWarning} />{/if}

			{#if data.wallet}
				<a href="/app/wallet/{c.dropzone.slug}" class="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
					<span class="flex items-center gap-3">
						<span class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name="wallet" class="size-5" /></span>
						<span>
							<span class="block text-xs text-muted">Wallet available</span>
							<span class="block font-semibold tabular-nums">{formatMoney(data.wallet.availableMinor, data.wallet.currency)}</span>
						</span>
					</span>
					<span class="text-right text-xs text-muted">
						{#if data.wallet.pendingMinor}{formatMoney(data.wallet.pendingMinor, data.wallet.currency)} reserved<br />{/if}
						Top up <JIcon name="chevronRight" class="inline size-3" />
					</span>
				</a>
			{:else if c.dropzone.walletEnabled}
				<p class="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
					No wallet funds yet at {c.dropzone.name}. <a href="/app/wallet/{c.dropzone.slug}" class="font-medium text-primary hover:underline">Top up</a> or pay at manifest.
				</p>
			{/if}

			<FormAlert message={generalError} />
		</aside>

		<div class="space-y-4 lg:col-span-2">
			{#if data.waiver}
				<Card title="Indemnity & waiver" description="{c.dropzone.name} needs your signed sport-jumper indemnity before you manifest.">
					<form method="POST" action="?/waiver" class="space-y-4" use:enhance={submit('waiver')} data-testid="waiver-form">
						<div class="max-h-72 space-y-4 overflow-y-auto rounded-xl border border-border bg-surface-2/40 p-4 text-sm">
							{#each data.waiver.sections as s, i (i)}
								{#if s.type === 'acknowledgement'}
									<label class="flex items-start gap-3">
										<input type="checkbox" name="ack" value={i} required class="mt-1 size-4 shrink-0 accent-[var(--dz-primary)]" />
										<span><span class="font-medium">{s.title}</span><br /><span class="text-muted">{s.content}</span></span>
									</label>
								{:else}
									<div>
										<p class="font-medium">{s.title}</p>
										<p class="mt-1 whitespace-pre-line text-muted">{s.content}</p>
									</div>
								{/if}
							{:else}
								<p class="text-muted">The dropzone hasn’t added any sections yet.</p>
							{/each}
						</div>
						<Input label="Type your full name to sign" name="signerName" value={data.me.name} required autocomplete="name" />
						<FormAlert message={err?.action === 'waiver' ? err.message : null} />
						<Button type="submit" loading={busy === 'waiver'} class="w-full sm:w-auto"><JIcon name="pen" class="size-4" /> Agree & complete indemnity</Button>
					</form>
				</Card>
			{/if}

			<div class="flex items-end justify-between">
				<h2 class="text-lg font-semibold tracking-tight">Today’s loads</h2>
				<p class="text-sm text-muted">{data.loads.length} open</p>
			</div>
			{#each data.loads as load (load.id)}
				<LoadCard
					{load}
					prices={data.prices}
					currency={c.dropzone.currency}
					soloTypes={data.soloTypes}
					teamTypes={data.teamTypes}
					changeTypes={data.changeTypes}
					extras={data.extras}
					teams={data.teams}
					wallet={c.dropzone.walletEnabled ? data.wallet ?? { availableMinor: 0, currency: c.dropzone.currency } : null}
					defaultExtras={c.gearRental ? ['gear_rental'] : []}
					error={errFor(load.id)}
					blocked={!!data.waiver}
				/>
			{:else}
				<EmptyState title="No open loads right now" description="Manifest hasn’t opened any loads for self-manifest yet. You’ll get a notification when new loads are created.">
					{#snippet icon()}<Icon name="plane" class="size-6" />{/snippet}
				</EmptyState>
			{/each}
		</div>
	</div>
{/if}
