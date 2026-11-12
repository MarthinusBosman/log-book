<script lang="ts">
	/** Passenger form fields (staff create + edit). Posts the names parsePassengerForm() reads. */
	import { Input, Select } from '#lib/ui/index.ts';
	import { HEARD_FROM, SLOT_EXTRA_LABELS, formatMoney, type SlotExtra } from '#lib/domain/constants.ts';
	import { ageOn, limitWarnings, type TandemLimits } from './model.ts';

	type Values = Partial<{
		name: string | null;
		email: string | null;
		phone: string | null;
		idNumber: string | null;
		gender: string | null;
		dob: string | null;
		nationality: string | null;
		weightKg: number | null;
		heightCm: number | null;
		addressLine1: string | null;
		city: string | null;
		postalCode: string | null;
		country: string | null;
		guardianName: string | null;
		guardianEmail: string | null;
		guardianIdNumber: string | null;
		emergencyName: string | null;
		emergencyPhone: string | null;
		emergencyEmail: string | null;
		jumpDate: string | null;
		bookingTime: string | null;
		extras: SlotExtra[];
		heardFrom: string | null;
		note: string | null;
	}>;
	type Props = {
		values?: Values;
		offer: { extras: { code: SlotExtra; priceMinor: number }[] };
		currency: string;
		limits: TandemLimits;
		mode?: 'create' | 'edit';
	};
	let { values = {}, offer, currency, limits, mode = 'edit' }: Props = $props();

	let weight = $state<number | null>(null);
	let height = $state<number | null>(null);
	let dob = $state('');
	let date = $state('');
	$effect.pre(() => {
		weight = values.weightKg ?? null;
		height = values.heightCm ?? null;
		dob = values.dob ?? '';
		date = values.jumpDate ?? '';
	});
	const warnings = $derived(limitWarnings({ weightKg: weight, heightCm: height }, limits));
	const minor = $derived(!!dob && !!date && ageOn(dob, date) < 18);
	const v = (x: string | number | null | undefined) => (x ?? '') as string;
</script>

<div class="grid gap-4">
	<fieldset class="grid gap-3 sm:grid-cols-2">
		<legend class="mb-2 text-xs font-semibold tracking-wider text-subtle uppercase">Passenger</legend>
		<Input label="Full name" name="name" value={v(values.name)} required class="sm:col-span-2" autocomplete="off" />
		<Input label="Email" name="email" type="email" value={v(values.email)} inputmode="email" autocomplete="off" />
		<Input label="Phone" name="phone" type="tel" value={v(values.phone)} inputmode="tel" autocomplete="off" />
		<Input label="Weight (kg)" name="weightKg" type="number" step="0.1" min="20" max="250" bind:value={weight} />
		<Input label="Height (cm)" name="heightCm" type="number" step="1" min="80" max="250" bind:value={height} />
		{#if warnings.length}
			<p class="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning sm:col-span-2" role="status">
				{warnings.join(' · ')}
			</p>
		{/if}
		{#if mode === 'edit'}
			<Input label="ID / Passport" name="idNumber" value={v(values.idNumber)} />
			<Select
				label="Gender"
				name="gender"
				value={v(values.gender)}
				options={[
					{ value: '', label: '—' },
					{ value: 'female', label: 'Female' },
					{ value: 'male', label: 'Male' },
					{ value: 'other', label: 'Other' }
				]}
			/>
			<Input label="Date of birth" name="dob" type="date" bind:value={dob} />
			<Input label="Nationality" name="nationality" value={v(values.nationality)} />
			<Input label="Address" name="addressLine1" value={v(values.addressLine1)} class="sm:col-span-2" />
			<Input label="City" name="city" value={v(values.city)} />
			<Input label="Postal code" name="postalCode" value={v(values.postalCode)} />
			<Input label="Country" name="country" value={v(values.country)} />
		{/if}
	</fieldset>

	{#if mode === 'edit' && minor}
		<fieldset class="grid gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4 sm:grid-cols-2">
			<legend class="px-1 text-xs font-semibold tracking-wider text-warning uppercase">Parent / guardian (under 18)</legend>
			<Input label="Guardian name" name="guardianName" value={v(values.guardianName)} required />
			<Input label="Guardian email" name="guardianEmail" type="email" value={v(values.guardianEmail)} required />
			<Input label="Guardian ID / Passport" name="guardianIdNumber" value={v(values.guardianIdNumber)} required />
		</fieldset>
	{/if}

	{#if mode === 'edit'}
		<fieldset class="grid gap-3 sm:grid-cols-2">
			<legend class="mb-2 text-xs font-semibold tracking-wider text-subtle uppercase">Emergency contact</legend>
			<Input label="Name" name="emergencyName" value={v(values.emergencyName)} />
			<Input label="Phone" name="emergencyPhone" type="tel" value={v(values.emergencyPhone)} />
			<Input label="Email" name="emergencyEmail" type="email" value={v(values.emergencyEmail)} class="sm:col-span-2" />
		</fieldset>
	{/if}

	<fieldset class="grid gap-3 sm:grid-cols-2">
		<legend class="mb-2 text-xs font-semibold tracking-wider text-subtle uppercase">Jump</legend>
		<Input label="Jump date" name="jumpDate" type="date" bind:value={date} />
		<Input label="Time" name="bookingTime" type="time" value={v(values.bookingTime)} />
		<input type="hidden" name="extras_present" value="1" />
		<div class="flex flex-wrap gap-2 sm:col-span-2">
			{#each offer.extras as e (e.code)}
				<label
					class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-sm transition-colors select-none has-[:checked]:border-primary/60 has-[:checked]:bg-primary/10 has-[:checked]:text-fg"
				>
					<input type="checkbox" name="extras" value={e.code} checked={values.extras?.includes(e.code)} class="size-4 accent-[var(--dz-primary)]" />
					{SLOT_EXTRA_LABELS[e.code]}
					<span class="text-xs text-muted">+{formatMoney(e.priceMinor, currency)}</span>
				</label>
			{:else}
				<p class="text-sm text-muted">No tandem add-ons are priced in the price list.</p>
			{/each}
		</div>
		{#if mode === 'create'}
			<Input label="Deposit already paid" name="deposit" inputmode="decimal" placeholder="0.00" hint="Amount in {currency}" />
		{:else}
			<Select
				label="Heard about us"
				name="heardFrom"
				value={v(values.heardFrom)}
				options={[{ value: '', label: '—' }, ...HEARD_FROM.map((h) => ({ value: h, label: h }))]}
			/>
		{/if}
		<div class="flex flex-col gap-1.5 sm:col-span-2">
			<label for="pf-note" class="text-sm font-medium">Tandem note</label>
			<textarea
				id="pf-note"
				name="note"
				rows="2"
				placeholder="Group booking, language, nervous flyer…"
				class="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] outline-none placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15"
				>{v(values.note)}</textarea
			>
		</div>
	</fieldset>
</div>
