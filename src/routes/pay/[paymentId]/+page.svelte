<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Icon } from '#lib/ui/index.ts';
	import { formatMoney, paymentMethodLabel } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let form: HTMLFormElement | undefined = $state();
	const label = $derived(paymentMethodLabel(data.provider));

	// Auto-continue once hydrated; the button covers no-JS and blocked auto-submits.
	onMount(() => {
		const t = setTimeout(() => form?.submit(), 400);
		return () => clearTimeout(t);
	});
</script>

<svelte:head><title>Continue to {label}</title></svelte:head>

<div class="grid min-h-dvh place-items-center px-4 py-10">
	<div class="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 text-center shadow-sm sm:p-8">
		<span class="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon name="shield" class="size-6" /></span>
		<p class="mt-4 text-sm text-muted">{data.dzName}</p>
		<p class="mt-1 text-3xl font-semibold tracking-tight tabular-nums" data-testid="pay-amount">{formatMoney(data.amountMinor, data.currency)}</p>
		<p class="mt-3 text-sm text-muted">Taking you to {label}’s secure payment page…</p>
		<form bind:this={form} method="POST" action={data.action} class="mt-6">
			{#each data.fields as [name, value] (name)}<input type="hidden" {name} {value} />{/each}
			<Button type="submit" size="lg" class="w-full" data-testid="pay-continue">Continue to {label} <Icon name="arrowRight" class="size-4" /></Button>
		</form>
		<a href={data.cancelHref} class="mt-3 inline-block text-sm text-muted hover:text-fg">Cancel</a>
	</div>
</div>
