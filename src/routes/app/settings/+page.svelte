<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Input, Select, Icon } from '#lib/ui/index.ts';
	import Textarea from '#lib/components/staffadmin/Textarea.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import { IMAGE_PRESETS, downscaleInput } from '#lib/client/resize-image.ts';
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
	const CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'NAD', 'BWP', 'KES', 'CHF', 'NOK', 'SEK'];

	let saving = $state(false);
	let uploading = $state(false);
	let preview = $state<string | null>(null);
	const currencyOptions = $derived(
		[...new Set([data.dz.currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))
	);
	const tzOptions = $derived(data.timezones.map((t) => ({ value: t, label: t.replace(/_/g, ' ') })));

	let resizing = $state(false);
	async function onPick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		resizing = true;
		// Re-encode to ≤1600 px WebP (strips EXIF/GPS) before upload: storage is metered.
		const file = await downscaleInput(input, IMAGE_PRESETS.dzPhoto).finally(() => (resizing = false));
		if (preview) URL.revokeObjectURL(preview);
		preview = file ? URL.createObjectURL(file) : null;
	}
</script>

<svelte:head><title>Settings · Dropzone</title></svelte:head>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<form method="POST" action="?/save" use:enhance={toastEnhance({ pending: (v) => (saving = v) })} class="space-y-6">
		<Card title="Profile" description="Shown on your public dropzone page and booking widget.">
			<div class="grid gap-4 sm:grid-cols-2">
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
			<div class="grid gap-4 sm:grid-cols-2">
				<Input label="Address" name="address" value={data.dz.address ?? ''} class="sm:col-span-2" autocomplete="street-address" />
				<Input label="Latitude" name="lat" inputmode="decimal" value={data.dz.lat ?? ''} placeholder="-33.0286" />
				<Input label="Longitude" name="lng" inputmode="decimal" value={data.dz.lng ?? ''} placeholder="18.1667" />
				<Input label="Country code" name="country" maxlength={2} value={data.dz.country ?? ''} placeholder="ZA" />
				<Select label="Timezone" name="timezone" value={data.dz.timezone} options={tzOptions} />
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
			<div class="grid gap-4 sm:grid-cols-2">
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
			<div class="aspect-[16/9] overflow-hidden rounded-xl border border-border bg-surface-2">
				{#if preview || data.dz.photoUrl}
					<img src={preview ?? data.dz.photoUrl} alt="{data.dz.name} photo" class="size-full object-cover" />
				{:else}
					<div class="grid size-full place-items-center text-subtle">
						<Icon name="parachute" class="size-10" />
					</div>
				{/if}
			</div>
			<form
				method="POST"
				action="?/photo"
				enctype="multipart/form-data"
				class="mt-4 space-y-3"
				use:enhance={toastEnhance({ pending: (v) => (uploading = v), reset: true, onSuccess: () => (preview = null) })}
			>
				<input
					type="file"
					name="photo"
					accept="image/png,image/jpeg,image/webp"
					required
					onchange={onPick}
					aria-label="Dropzone photo"
					class="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-elevated"
				/>
				<p class="text-xs text-subtle">PNG, JPG or WebP. Resized to 1600 px and saved as WebP.</p>
				<div class="flex gap-2">
					<Button type="submit" size="sm" loading={uploading || resizing}>Upload</Button>
					{#if data.dz.photoUrl}
						<Button type="submit" size="sm" variant="ghost" formaction="?/removePhoto" formnovalidate>Remove</Button>
					{/if}
				</div>
			</form>
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
