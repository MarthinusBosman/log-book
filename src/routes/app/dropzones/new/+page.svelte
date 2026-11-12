<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, Card, Input, Select } from '#lib/ui/index.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let submitting = $state(false);

	// Default the timezone to the browser's after hydration (SSR can't know it).
	let timezone = $state(untrack(() => form?.timezone) ?? 'UTC');
	onMount(() => {
		if (!form?.timezone) timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});
	const currencies = ['USD', 'EUR', 'GBP', 'ZAR', 'AUD', 'NZD', 'CAD', 'CHF', 'SEK', 'NOK', 'DKK', 'BRL'];
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
			<div class="grid gap-4 sm:grid-cols-2">
				<Input
					label="Country"
					name="country"
					placeholder="ZA"
					maxlength={2}
					hint="2-letter ISO code"
					value={form?.country ?? ''}
				/>
				<Select
					label="Currency"
					name="currency"
					value={form?.currency ?? 'USD'}
					options={currencies.map((c) => ({ value: c, label: c }))}
				/>
			</div>
			<Input label="Timezone" name="timezone" bind:value={timezone} hint="IANA timezone, e.g. Africa/Johannesburg" />
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
