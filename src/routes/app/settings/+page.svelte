<script lang="ts">
	import NoJsOutcome from '#lib/components/staffadmin/NoJsOutcome.svelte';
	import { enhance } from '$app/forms';
	import { Button, Card, Input, Select, Icon } from '#lib/ui/index.ts';
	import Textarea from '#lib/components/staffadmin/Textarea.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import { IMAGE_PRESETS } from '#lib/client/resize-image.ts';
	import ImageUpload from '#lib/components/ImageUpload.svelte';
	import { CURRENCIES } from '#lib/domain/currency.ts';
	import { countryName, countryOptions } from '#lib/domain/countries.ts';
	import { suggestTimezone } from '#lib/domain/timezone-countries.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const DAYS = [
		['mon', 'Mon'],
		['tue', 'Tue'],
		['wed', 'Wed'],
		['thu', 'Thu'],
		['fri', 'Fri'],
		['sat', 'Sat'],
		['sun', 'Sun']
	] as const;

	let saving = $state(false);
	const currencyOptions = $derived(
		[...new Set([data.dz.currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))
	);
	const tzOptions = $derived(data.timezones.map((t) => ({ value: t, label: t.replace(/_/g, ' ') })));
	const countryOpts = $derived([{ value: '', label: 'Not set' }, ...countryOptions(data.dz.country)]);
	// Country and timezone are separate fields here (unlike setup, nothing follows the country):
	// flag a zone outside the chosen country, since local dates and the manifest day use the zone.
	let country = $state(initCountry());
	let timezone = $state(initTimezone());
	function initCountry() {
		return data.dz.country ?? '';
	}
	function initTimezone() {
		return data.dz.timezone;
	}
	const tzFix = $derived(suggestTimezone(country, timezone, data.timezones));
	const zoneLabel = (z: string) => z.replace(/_/g, ' ');
</script>

<svelte:head><title>Settings · Dropzone</title></svelte:head>

<NoJsOutcome class="mb-4" />
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<form method="POST" action="?/save" use:enhance={toastEnhance({ pending: (v) => (saving = v) })} class="space-y-6">
		<Card title="Profile" description="Shown on your public dropzone page and booking widget.">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Input label="Dropzone name" name="name" required value={data.dz.name} class="sm:col-span-2" />
				<Input
					label="Link name"
					name="slug"
					value={data.dz.slug}
					hint="Used in links, e.g. /dz/{data.dz.slug}"
					pattern="[a-z0-9-]+"
					class="sm:col-span-2"
				/>
				<Textarea label="Description" name="description" rows={4} value={data.dz.description ?? ''} class="sm:col-span-2" placeholder="Aircraft, what jumpers can expect, facilities…" />
			</div>
		</Card>

		<Card title="Location" description="Used for distance in the dropzone list and for local dates.">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Input label="Address" name="address" value={data.dz.address ?? ''} class="sm:col-span-2" autocomplete="street-address" />
				<Input label="Latitude" name="lat" inputmode="decimal" value={data.dz.lat ?? ''} placeholder="-33.0286" />
				<Input label="Longitude" name="lng" inputmode="decimal" value={data.dz.lng ?? ''} placeholder="18.1667" />
				<Select label="Country" name="country" autocomplete="country" bind:value={country} options={countryOpts} />
				<div class="flex min-w-0 flex-col gap-2">
					<Select label="Timezone" name="timezone" bind:value={timezone} options={tzOptions} aria-describedby={tzFix ? 'tz-mismatch' : undefined} />
					{#if tzFix}
						<div id="tz-mismatch" class="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-fg" data-testid="tz-mismatch">
							<p>
								{zoneLabel(timezone)} isn't in {countryName(country)}. Local dates and the manifest day follow the timezone.
								{#if tzFix.several}{countryName(country)} has several timezones: pick the dropzone's.{/if}
							</p>
							<button
								type="button"
								class="mt-1 font-medium text-primary underline underline-offset-2"
								onclick={() => (timezone = tzFix?.zone ?? timezone)}
							>
								Use {zoneLabel(tzFix.zone)}
							</button>
						</div>
					{/if}
				</div>
				<Select
					label="Currency"
					name="currency"
					value={data.dz.currency}
					options={currencyOptions}
					hint="Prices and wallets use this currency."
				/>
			</div>
		</Card>

		<Card title="Contact & hours">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Input label="Email" name="contactEmail" type="email" value={data.dz.contactEmail ?? ''} />
				<Input label="Phone" name="contactPhone" type="tel" value={data.dz.contactPhone ?? ''} />
				<Input label="Website" name="website" type="url" value={data.dz.website ?? ''} placeholder="https://" class="sm:col-span-2" />
				<fieldset class="sm:col-span-2">
					<legend class="text-sm font-medium">Open days</legend>
					<div class="mt-2 flex flex-wrap gap-2">
						{#each DAYS as [value, label] (value)}
							<label class="cursor-pointer">
								<input type="checkbox" name="openDays" {value} checked={data.dz.openDays.includes(value)} class="peer sr-only" />
								<span
									class="inline-flex h-9 min-w-12 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20 hover:border-border-strong"
									>{label}</span
								>
							</label>
						{/each}
					</div>
				</fieldset>
				<Input label="Opens" name="openTime" type="time" value={data.dz.openTime ?? ''} />
				<Input label="Closes" name="closeTime" type="time" value={data.dz.closeTime ?? ''} />
			</div>
		</Card>

		<div class="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
			<Button type="submit" loading={saving} class="shadow-lg"><Icon name="check" class="size-4" /> Save details</Button>
		</div>
	</form>

	<div class="space-y-6">
		<Card title="Photo" description="Landscape images look best.">
			<ImageUpload
				action="?/photo"
				removeAction={data.dz.photoUrl ? '?/removePhoto' : null}
				field="photo"
				hasImage={!!data.dz.photoUrl}
				testid="dz-photo"
				hint="PNG, JPG or WebP. Resized to 1600 px and saved as WebP."
				resize={IMAGE_PRESETS.dzPhoto}
			>
				{#snippet preview({ busy })}
					<div class={['mb-4 aspect-[16/9] overflow-hidden rounded-xl border border-border bg-surface-2', busy && 'opacity-60']}>
						{#if data.dz.photoUrl}
							<img src={data.dz.photoUrl} alt="{data.dz.name} photo" class="size-full object-cover" data-testid="dz-photo-preview" />
						{:else}
							<div class="grid size-full place-items-center text-subtle">
								<Icon name="parachute" class="size-10" />
							</div>
						{/if}
					</div>
				{/snippet}
			</ImageUpload>
		</Card>
		<Card title="Preview" padded={false}>
			<div class="p-5">
				<p class="font-semibold">{data.dz.name}</p>
				<p class="mt-1 line-clamp-3 text-sm text-muted">{data.dz.description || 'No description yet.'}</p>
				<p class="mt-3 text-xs text-subtle">
					{data.dz.openDays.length ? data.dz.openDays.map((d) => d[0].toUpperCase() + d.slice(1)).join(', ') : 'Open days not set'}
					{#if data.dz.openTime && data.dz.closeTime}· {data.dz.openTime}–{data.dz.closeTime}{/if}
				</p>
			</div>
		</Card>
	</div>
</div>
