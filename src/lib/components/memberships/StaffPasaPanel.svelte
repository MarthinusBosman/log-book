<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button } from '#lib/ui/index.ts';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import type { PasaCheckVM } from './PasaCard.svelte';

	type Props = { check: PasaCheckVM | null; profileName: string; canReview: boolean; isSelf: boolean; today: string };
	let { check, profileName, canReview, isSelf, today }: Props = $props();
	let pending = $state<string | null>(null);
	const fmt = (t: number) => new Date(t).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
	const expired = $derived(!!check && (check.status === 'lapsed' || (!!check.expiry && check.expiry < today)));
</script>

{#if check}
	<div class="mt-4 rounded-xl border border-border bg-surface-2/40 p-3 text-sm" data-testid="staff-pasa" data-state={check.status}>
		{#if check.status === 'needs_review'}
			<p class="flex items-center gap-2 font-medium text-warning"><JIcon name="alert" class="size-4" /> PASA link needs confirmation</p>
			<dl class="mt-2 space-y-1 text-xs">
				<div class="flex justify-between gap-3"><dt class="text-muted">PASA {check.number}</dt><dd class="text-right font-medium">{check.memberName ?? '—'}</dd></div>
				<div class="flex justify-between gap-3"><dt class="text-muted">Profile name</dt><dd class="text-right font-medium">{profileName}</dd></div>
				<div class="flex justify-between gap-3"><dt class="text-muted">Licence · DZ</dt><dd class="text-right">{check.licence ?? '—'} · {check.dropzone ?? '—'}</dd></div>
				<div class="flex justify-between gap-3"><dt class="text-muted">Status</dt><dd>{check.current ? `Current, to ${check.expiry}` : `Not current (expired ${check.expiry})`}</dd></div>
			</dl>
			{#if canReview && !isSelf}
				<p class="mt-2 text-xs text-muted">Check their PASA card or ID, then confirm it’s the same person.</p>
				<div class="mt-2 flex gap-2">
					<form method="POST" action="?/pasaReview" use:enhance={toastEnhance({ pending: (v) => (pending = v ? 'yes' : null) })}>
						<input type="hidden" name="approve" value="1" />
						<Button type="submit" size="sm" loading={pending === 'yes'} data-testid="pasa-approve"><JIcon name="badgeCheck" class="size-4" /> Confirm</Button>
					</form>
					<form method="POST" action="?/pasaReview" use:enhance={toastEnhance({ pending: (v) => (pending = v ? 'no' : null) })}>
						<input type="hidden" name="approve" value="0" />
						<Button type="submit" size="sm" variant="ghost" loading={pending === 'no'}>Not them</Button>
					</form>
				</div>
			{:else if isSelf}
				<p class="mt-2 text-xs text-muted">Another staff member has to confirm your own link.</p>
			{/if}
		{:else if check.status === 'rejected'}
			<p class="flex items-center gap-2 text-muted"><JIcon name="x" class="size-4" /> PASA {check.number} link declined{check.reviewedAt ? ` ${fmt(check.reviewedAt)}` : ''}</p>
		{:else}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="flex items-center gap-2 font-medium {expired ? 'text-danger' : 'text-success'}">
					<JIcon name={expired ? 'alert' : 'badgeCheck'} class="size-4" />
					{expired ? 'PASA expired' : 'Verified with PASA'}
				</span>
				<Badge tone="neutral">checked {fmt(check.checkedAt)}</Badge>
			</div>
			{#if expired}<p class="mt-1 text-xs text-muted">Not on PASA’s current members list. They can reconnect once they’ve renewed.</p>{/if}
		{/if}
	</div>
{/if}
