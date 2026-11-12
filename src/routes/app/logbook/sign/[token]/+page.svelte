<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Card, EmptyState, Icon } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import SignaturePad from '#lib/components/jumper/SignaturePad.svelte';
	import { fmtDate, fmtDateTime, fmtFreefall, fmtNumber } from '#lib/components/jumper/format.ts';
	import { JUMP_TYPE_LABELS, type JumpType } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	let signature = $state('');
</script>

<svelte:head><title>Sign a jump</title></svelte:head>

<PageHeader title="Sign a jump" icon="book" />

<div class="mx-auto max-w-xl">
	{#if data.state !== 'ok'}
		<EmptyState
			title={data.state === 'expired' ? 'This sign-off link has expired' : 'This sign-off link isn’t valid'}
			description="Ask the jumper to create a new link from their logbook."
		>
			{#snippet icon()}<JIcon name="alert" class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		{@const j = data.jump}
		<Card>
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-xs font-medium tracking-wider text-muted uppercase">{data.ownerName}</p>
					<h2 class="mt-1 text-2xl font-semibold tracking-tight">Jump #{j.jumpNumber}</h2>
					<p class="text-sm text-muted">{fmtDate(j.jumpDate)}{j.place ? ` · ${j.place}` : ''}</p>
				</div>
				{#if j.verified}<Badge tone="success"><JIcon name="badgeCheck" class="size-3.5" /> Verified</Badge>{/if}
			</div>
			<dl class="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
				{#each [['Type', j.jumpType ? (JUMP_TYPE_LABELS[j.jumpType as JumpType] ?? j.jumpType) : '—'], ['Aircraft', j.aircraft ?? '—'], ['Altitude', j.altitudeFt ? `${fmtNumber(j.altitudeFt)} ft` : '—'], ['Freefall', j.freefallSeconds ? fmtFreefall(j.freefallSeconds) : '—']] as [k, v] (k)}
					<div class="rounded-xl bg-surface-2/60 p-3"><dt class="text-xs text-muted">{k}</dt><dd class="truncate font-medium">{v}</dd></div>
				{/each}
			</dl>
			{#if j.description}<p class="mt-4 rounded-xl border border-border p-3 text-sm whitespace-pre-line">{j.description}</p>{/if}
		</Card>

		<div class="mt-4">
			{#if form?.success || (j.signedAt && !data.own && !form)}
				<div class="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/5 p-5" data-testid="sign-done">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success"><JIcon name="badgeCheck" class="size-5" /></span>
					<div class="text-sm">
						<p class="font-semibold">{form?.success ?? `Already signed by ${j.signerName}`}</p>
						<p class="text-muted">{form?.success ? `Thanks — ${data.ownerName}'s logbook now shows your name and licence.` : fmtDateTime(j.signedAt)}</p>
					</div>
				</div>
			{:else if data.own}
				<FormAlert tone="info" message="This is your own jump. Send this link or QR code to an instructor or licensed jumper to sign it." />
			{:else if !data.me.licensed}
				<FormAlert message="Only licensed jumpers can sign jumps. Add your licence number in your profile first." />
				<Button href="/app/profile?tab=credentials" variant="secondary" class="mt-3">Update my credentials</Button>
			{:else}
				<Card title="Sign as {data.me.name}" description={data.me.licence ? `Licence ${data.me.licence}` : 'Rated jumper'}>
					<form method="POST" class="space-y-4" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
						<SignaturePad bind:value={signature} />
						<input type="hidden" name="signature" value={signature} />
						<label class="flex items-start gap-3 text-sm">
							<input type="checkbox" name="confirm" value="1" required class="mt-0.5 size-4 accent-[var(--dz-primary)]" />
							<span>I witnessed or supervised this jump and confirm the details above are correct.</span>
						</label>
						<FormAlert message={form?.message} />
						<Button type="submit" size="lg" class="w-full" loading={busy} data-testid="sign-now"><JIcon name="pen" class="size-5" /> Sign now</Button>
					</form>
				</Card>
			{/if}
		</div>
	{/if}
</div>
