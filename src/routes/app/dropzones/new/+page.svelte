<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, Card, Input, Select } from '#lib/ui/index.ts';
	import { CURRENCIES, currencyForCountry } from '#lib/domain/currency.ts';
	import { countryFromLanguage, countryOptions } from '#lib/domain/countries.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let submitting = $state(false);

	// Default the timezone to the browser's after hydration (SSR can't know it).
	let timezone = $state(untrack(() => form?.timezone) ?? 'UTC');
	onMount(() => {
		if (!form?.timezone) timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		// Preselect the country from the browser's language region (en-ZA → South Africa).
		if (!form?.country && !country) {
			const guess = navigator.languages.map(countryFromLanguage).find(Boolean);
			if (guess) {
				country = guess;
				onCountry();
			}
		}
	});
	// The browser's zone may be an alias missing from the server's list: keep it selectable.
	const tzOptions = $derived(
		[...new Set([timezone, ...data.timezones])].map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))
	);
	// Currency follows the country until the owner picks one themselves.
	let country = $state(untrack(() => form?.country) ?? '');
	let currency = $state(untrack(() => form?.currency) ?? 'USD');
	let currencyTouched = $state(untrack(() => !!form?.currency));
	function onCountry() {
		const guess = currencyForCountry(country);
		if (guess && !currencyTouched) currency = guess;
	}
	const countryOpts = $derived([{ value: '', label: 'Choose a country' }, ...countryOptions(country)]);
	const currencyOptions = $derived([...new Set([currency, ...CURRENCIES])].map((c) => ({ value: c, label: c })));
</script>

<svelte:head><title>New dropzone</title></svelte:head>

<div class="mx-auto max-w-xl">
	<h1 class="text-2xl font-semibold tracking-tight">Set up a dropzone</h1>
	<p class="mt-1 text-muted">You'll be its owner. You can invite staff and fine-tune everything later.</p>

	<Card class="mt-6">
		<form
			method="POST"
			class="flex flex-col gap-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
		>
			<Input label="Dropzone name" name="name" required placeholder="Skydive Robertson" value={form?.name ?? ''} />
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Select
					label="Country"
					name="country"
					autocomplete="country"
					bind:value={country}
					onchange={onCountry}
					options={countryOpts}
					hint="Suggests the currency and the reserve repack interval."
				/>
				<Select
					label="Currency"
					name="currency"
					bind:value={currency}
					onchange={() => (currencyTouched = true)}
					options={currencyOptions}
				/>
			</div>
			<Select
				label="Timezone"
				name="timezone"
				bind:value={timezone}
				options={tzOptions}
				hint="Local dates, opening hours and the manifest day follow this."
			/>
			{#if form?.message}
				<p class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
					{form.message}
				</p>
			{/if}
			<div class="flex justify-end gap-2 pt-2">
				<Button href="/app" variant="ghost">Cancel</Button>
				<Button type="submit" loading={submitting}>Create dropzone</Button>
			</div>
		</form>
	</Card>
</div>
