<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Icon } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/staffadmin/PageHeader.svelte';
	import MoneyField from '#lib/components/staffadmin/MoneyField.svelte';
	import { PRICE_GROUPS } from '#lib/components/staffadmin/pricelistGroups.ts';
	import { currencySymbol, minorToInput, parseMoney } from '#lib/components/staffadmin/money.ts';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import { PRICE_ITEMS, formatMoney } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const symbol = $derived(currencySymbol(data.currency));
	// svelte-ignore state_referenced_locally
	let values = $state<Record<string, string>>(Object.fromEntries(Object.entries(data.prices).map(([k, v]) => [k, minorToInput(v)])));
	let saving = $state(false);
	let dirty = $state(false);
	const errors = $derived((form as { errors?: Record<string, string> } | null)?.errors ?? {});

	const v = (code: string) => parseMoney(values[code]) ?? 0;
	const money = (minor: number) => formatMoney(minor, data.currency);
	const examples = $derived([
		{ label: 'Sport jump + gear rental', total: v('sport_slot') + v('gear_rental') },
		{ label: 'Tandem + handcam + video', total: v('tandem_slot') + v('tandem_handcam') + v('tandem_outside_video') },
		{ label: 'Tandem balance after deposit', total: Math.max(0, v('tandem_slot') - v('tandem_deposit')) },
		{ label: 'AFF jumps 1–10 (one each)', total: v('aff_1_3') * 3 + v('aff_4_7') * 4 + v('aff_8_10') * 3 }
	]);
</script>

<svelte:head><title>Pricelist</title></svelte:head>

<svelte:window
	onbeforeunload={(e) => {
		if (dirty) e.preventDefault();
	}}
/>

<form
	method="POST"
	action="?/save"
	novalidate
	oninput={() => (dirty = true)}
	use:enhance={toastEnhance({ pending: (p) => (saving = p), onSuccess: () => (dirty = false) })}
>
	<PageHeader icon="tag" title="Pricelist" description="Prices per jump in {data.currency}. Changes apply to new slots; existing slots keep their price.">
		{#snippet actions()}
			<a href="/app/settings" class="text-sm text-muted hover:text-fg">Currency: <span class="font-medium text-fg">{data.currency} ({symbol})</span></a>
			<Button type="submit" loading={saving}><Icon name="check" class="size-4" /> Save all</Button>
		{/snippet}
	</PageHeader>

	{#if data.unset}
		<p class="mt-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
			<span class="font-medium text-warning">Your price list is empty.</span> Fill in your prices and save once — manifest uses them to price every slot.
		</p>
	{/if}

	<div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
		<div class="grid gap-4 md:grid-cols-2">
			{#each PRICE_GROUPS as g (g.id)}
				<Card title={g.title} description={g.description} class={g.id === 'staff_pay' ? 'md:col-span-2' : ''}>
					<div class="grid gap-3 {g.id === 'staff_pay' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}">
						{#each g.codes as c (c.code)}
							<MoneyField
								name={c.code}
								label={PRICE_ITEMS[c.code].label}
								help={c.help}
								{symbol}
								bind:value={values[c.code]}
								error={errors[c.code]}
							/>
						{/each}
					</div>
				</Card>
			{/each}
		</div>

		<aside class="space-y-4 xl:sticky xl:top-6 xl:self-start">
			<Card title="What jumpers pay" description="Live from the prices on this page.">
				<ul class="space-y-3 text-sm">
					{#each examples as ex (ex.label)}
						<li class="flex items-baseline justify-between gap-3">
							<span class="text-muted">{ex.label}</span>
							<span class="font-semibold tabular-nums">{money(ex.total)}</span>
						</li>
					{/each}
				</ul>
			</Card>
			<Card padded>
				<p class="text-sm text-muted">
					Working staff jump free. Staff pay is added to each staff slot and totals appear on
					<a href="/app/staff" class="text-primary hover:underline">Staff</a>.
				</p>
				{#if dirty}<p class="mt-3 text-sm font-medium text-warning">You have unsaved changes.</p>{/if}
				<Button type="submit" class="mt-4 w-full" loading={saving}>Save all prices</Button>
			</Card>
		</aside>
	</div>
</form>
