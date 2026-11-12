<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from '#lib/ui/index.ts';
	import FormAlert from './FormAlert.svelte';
	import Textarea from './Textarea.svelte';

	type Values = Partial<{
		name: string | null;
		container: string | null;
		mainCanopy: string | null;
		mainSizeSqft: number | string | null;
		reserveCanopy: string | null;
		reserveSizeSqft: number | string | null;
		reserveRepackedOn: string | null;
		repackIntervalDays: number | string | null;
		aad: string | null;
		aadSerial: string | null;
		aadServiceDueOn: string | null;
		aadExpiresOn: string | null;
		wingsuit: string | null;
		notes: string | null;
	}>;
	type Props = { values: Values; exitWeightKg: number | null; intervalDays: number; today: string; action: string; submitLabel: string; error?: string | null };
	let { values, exitWeightKg, intervalDays, today, action, submitLabel, error }: Props = $props();
	let busy = $state(false);
	// svelte-ignore state_referenced_locally
	let main = $state<number | string | null>(values.mainSizeSqft ?? '');
	// svelte-ignore state_referenced_locally
	let weight = $state<number | string | null>(exitWeightKg ?? '');
	const wl = $derived.by(() => {
		const s = Number(main);
		const w = Number(weight);
		return s > 0 && w > 0 ? Math.round(((w * 2.20462) / s) * 100) / 100 : null;
	});
	const wlTone = $derived(wl === null ? '' : wl > 1.6 ? 'text-danger' : wl > 1.2 ? 'text-warning' : 'text-success');
</script>

<form
	method="POST"
	{action}
	class="space-y-6"
	data-testid="rig-form"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<section class="space-y-4">
		<h3 class="text-xs font-semibold tracking-wider text-muted uppercase">Container</h3>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<Input label="Container make & model *" name="container" placeholder="Mirage G4, Javelin Odyssey…" value={values.container ?? ''} required />
			<Input label="Nickname" name="name" placeholder="e.g. Blue rig" value={values.name ?? ''} />
		</div>
	</section>

	<section class="space-y-4">
		<h3 class="text-xs font-semibold tracking-wider text-muted uppercase">Main canopy</h3>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
			<Input label="Main canopy *" name="mainCanopy" placeholder="Sabre3, Pilot…" value={values.mainCanopy ?? ''} class="col-span-2 sm:col-span-1" required />
			<Input label="Size (sq ft)" name="mainSizeSqft" type="number" inputmode="numeric" min="20" max="500" bind:value={main} />
			<Input label="Exit weight (kg)" type="number" inputmode="decimal" min="30" max="200" bind:value={weight} hint="From your profile" />
		</div>
		<div class="flex items-center justify-between rounded-xl border border-border bg-surface-2/50 px-4 py-3" data-testid="wing-loading">
			<span class="text-sm text-muted">Wing loading</span>
			<span class="text-lg font-semibold tabular-nums {wlTone}">{wl === null ? '—' : `${wl.toFixed(2)} lb/ft²`}</span>
		</div>
	</section>

	<section class="space-y-4">
		<h3 class="text-xs font-semibold tracking-wider text-muted uppercase">Reserve</h3>
		<div class="grid grid-cols-2 gap-4">
			<Input label="Reserve canopy *" name="reserveCanopy" placeholder="Smart, PD Reserve…" value={values.reserveCanopy ?? ''} class="col-span-2 sm:col-span-1" required />
			<Input label="Size (sq ft)" name="reserveSizeSqft" type="number" inputmode="numeric" min="20" max="500" value={values.reserveSizeSqft ?? ''} class="col-span-2 sm:col-span-1" />
			<Input label="Last repack date *" name="reserveRepackedOn" type="date" min="1900-01-01" max={today} value={values.reserveRepackedOn ?? ''} required />
			<Input label="Repack interval (days)" name="repackIntervalDays" type="number" inputmode="numeric" min="30" max="400" placeholder={String(intervalDays)} value={values.repackIntervalDays ?? ''} hint="Blank = dropzone default" />
		</div>
	</section>

	<section class="space-y-4">
		<h3 class="text-xs font-semibold tracking-wider text-muted uppercase">AAD</h3>
		<div class="grid grid-cols-2 gap-4">
			<Input label="AAD make & model" name="aad" placeholder="Cypres 2, Vigil…" value={values.aad ?? ''} />
			<Input label="Serial" name="aadSerial" value={values.aadSerial ?? ''} />
			<Input label="Next service due" name="aadServiceDueOn" type="date" min="1900-01-01" value={values.aadServiceDueOn ?? ''} />
			<Input label="End of life" name="aadExpiresOn" type="date" min="1900-01-01" value={values.aadExpiresOn ?? ''} />
		</div>
	</section>

	<section class="space-y-4">
		<h3 class="text-xs font-semibold tracking-wider text-muted uppercase">Other</h3>
		<Input label="Wingsuit make & model" name="wingsuit" value={values.wingsuit ?? ''} />
		<Textarea label="Notes" name="notes" value={values.notes ?? ''} rows={3} />
	</section>

	<FormAlert message={error} />
	<div class="flex justify-end">
		<Button type="submit" size="lg" loading={busy} class="w-full sm:w-auto" data-testid="save-rig">{submitLabel}</Button>
	</div>
</form>
