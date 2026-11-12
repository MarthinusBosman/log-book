<script lang="ts">
	import { EmptyState, Icon } from '#lib/ui/index.ts';
	import { formatMoney } from '#lib/domain/constants.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Wallet</title></svelte:head>

<PageHeader title="Wallet" icon="wallet" description="One wallet per dropzone. Jumps are reserved when you manifest and charged when the load lands." />

{#if data.accounts.length === 0 && data.others.length === 0}
	<EmptyState title="No wallets yet" description="Check in at a dropzone that uses wallets and your balance will show up here.">
		{#snippet icon()}<Icon name="wallet" class="size-6" />{/snippet}
	</EmptyState>
{:else}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="wallet-list">
		{#each data.accounts as a (a.dropzone.id)}
			<a href="/app/wallet/{a.dropzone.slug}" class="group relative overflow-hidden rounded-3xl border border-border bg-linear-to-br from-primary/15 via-surface to-surface p-5 transition-colors hover:border-primary/40">
				<div class="pointer-events-none absolute -right-10 -bottom-16 size-40 rounded-full bg-primary/15 blur-2xl"></div>
				<div class="relative flex items-center justify-between">
					<span class="truncate text-sm font-medium">{a.dropzone.name}</span>
					<JIcon name="chevronRight" class="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
				</div>
				<p class="relative mt-6 text-xs text-muted">Available</p>
				<p class="relative text-3xl font-semibold tracking-tight tabular-nums {a.availableMinor < 0 ? 'text-danger' : ''}">{formatMoney(a.availableMinor, a.currency)}</p>
				<p class="relative mt-1 text-sm text-muted tabular-nums">{a.pendingMinor ? `${formatMoney(a.pendingMinor, a.currency)} reserved for jumps` : 'Nothing reserved'}</p>
			</a>
		{/each}
		{#each data.others as o (o.slug)}
			<a href="/app/wallet/{o.slug}" class="flex flex-col justify-between rounded-3xl border border-dashed border-border-strong p-5 text-muted transition-colors hover:border-primary/40 hover:text-fg">
				<span class="text-sm font-medium text-fg">{o.name}</span>
				<span class="mt-6 inline-flex items-center gap-1.5 text-sm"><Icon name="plus" class="size-4" /> Open wallet</span>
			</a>
		{/each}
	</div>
{/if}
