<script lang="ts">
	import { Button, Card, Input } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import { formatMoney } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.preview);
	const r = $derived(p.retained);
	const keptTotal = $derived(r.waivers + r.slots + r.ledgerEntries + r.checkins + r.payments);
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
</script>

<svelte:head><title>Delete account</title></svelte:head>

<PageHeader title="Delete account" icon="user" description="Permanently remove your account and personal data." />

<div class="max-w-2xl space-y-6" data-testid="delete-account">
	<p><a href="/app/profile?tab=security" class="text-sm text-muted hover:text-fg">← Back to profile</a></p>

	{#if data.blockedMessage}
		<FormAlert message={data.blockedMessage} />
		{#if p.soleOwnerOf.length}
			<p class="text-sm text-muted">
				A dropzone always needs an owner. Add another owner in
				<a href="/app/settings/members" class="text-primary hover:underline">Settings → Members &amp; roles</a>, then come back.
			</p>
		{/if}
	{:else}
		<Card title="What is deleted">
			<ul class="list-disc space-y-1.5 pl-5 text-sm text-muted">
				<li>Your profile, photo, contact and emergency details, licence, ratings and PASA check</li>
				<li>Your logbook (including sign-off signatures on your jumps), gear and service history</li>
				<li>Your sessions, linked accounts, notifications, buddies, personal teams, dropzone memberships and follows</li>
			</ul>
			<p class="mt-3 text-sm text-muted">You'll be signed out everywhere, and your email address can be used to sign up again.</p>
		</Card>

		<Card title="What your dropzones keep">
			<p class="text-sm text-muted">
				Dropzones must keep some records for legal and financial reasons. These stay with the dropzone, no longer linked
				to an account (your account becomes an anonymous placeholder):
			</p>
			{#if keptTotal > 0}
				<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-muted" data-testid="retained">
					{#if r.waivers}<li>{plural(r.waivers, 'signed waiver')}</li>{/if}
					{#if r.slots}<li>{plural(r.slots, 'manifest slot')}</li>{/if}
					{#if r.ledgerEntries}<li>{plural(r.ledgerEntries, 'wallet transaction')}</li>{/if}
					{#if r.checkins}<li>{plural(r.checkins, 'check-in')}</li>{/if}
					{#if r.payments}<li>{plural(r.payments, 'payment record')}</li>{/if}
				</ul>
			{:else}
				<p class="mt-3 text-sm text-muted">You have none at the moment.</p>
			{/if}
			<p class="mt-3 text-sm text-muted">
				Sign-offs you gave on other jumpers' logbooks stay in their logbooks. To have dropzone records removed, ask the
				dropzone. Details: <a href="/privacy#deletion" class="text-primary hover:underline">Privacy policy</a>.
			</p>
			{#if p.linkedAccounts}
				<p class="mt-3 text-sm text-muted">
					Your {plural(p.linkedAccounts, 'linked account')} will be unlinked. Jumps already copied to another
					{p.linkedAccounts === 1 ? 'server stay there' : 'servers stay there'}; delete that account separately.
				</p>
			{/if}
		</Card>

		{#if p.wallets.length}
			<div class="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm" role="alert" data-testid="wallet-warning">
				<p class="font-medium">You still have money in a dropzone wallet</p>
				<ul class="mt-1 space-y-0.5">
					{#each p.wallets as w (w.dropzoneName + w.currency)}
						<li>{w.dropzoneName}: {formatMoney(w.availableMinor, w.currency)}{w.pendingMinor ? ` (+ ${formatMoney(w.pendingMinor, w.currency)} held)` : ''}</li>
					{/each}
				</ul>
				<p class="mt-1 text-muted">Ask the dropzone for a refund before you delete. After deletion you can't use or see this balance.</p>
			</div>
		{/if}

		<Card title="Confirm">
			<form method="POST" class="space-y-4" data-testid="delete-form">
				{#if p.hasPassword}
					<Input label="Your password" name="password" type="password" autocomplete="current-password" required />
				{:else}
					<Input label="Type your email address: {p.email}" name="email" type="email" autocomplete="off" required />
				{/if}
				<label class="flex items-start gap-3 text-sm">
					<input type="checkbox" name="understand" required class="mt-0.5 size-4 accent-[var(--color-danger)]" />
					<span>I understand this can't be undone.</span>
				</label>
				<FormAlert message={form?.message ?? null} />
				<div class="flex flex-wrap justify-end gap-2">
					<Button href="/app/profile?tab=security" variant="ghost">Cancel</Button>
					<Button type="submit" variant="danger">Delete my account</Button>
				</div>
			</form>
		</Card>
	{/if}
</div>
