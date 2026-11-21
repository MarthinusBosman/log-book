<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Select } from '#lib/ui/index.ts';
	import { JUMP_TYPES, JUMP_TYPE_LABELS } from '#lib/domain/constants.ts';
	import FormAlert from './FormAlert.svelte';
	import Textarea from './Textarea.svelte';
	import { cn } from '#lib/ui/index.ts';

	type Values = {
		/** Numbers may be text when echoing back a submission that didn't parse. */
		jumpNumber: number | string;
		jumpDate: string;
		dropzoneId: string | null;
		location: string | null;
		aircraft: string | null;
		altitudeFt: number | string | null;
		freefallSeconds: number | string | null;
		jumpType: string | null;
		description: string | null;
		rigId: string | null;
	};
	type Props = {
		values: Values;
		dropzones: { id: string; name: string }[];
		rigs: { id: string; name: string; active: boolean }[];
		/** Aircraft names offered as suggestions (past jumps first, then the dropzones' fleets). */
		planes?: string[];
		/** Verified jumps: number, date, DZ and aircraft are locked. */
		locked?: boolean;
		action: string;
		submitLabel: string;
		error?: string | null;
		/** Per-field messages from the server ({ inputName: message }), shown next to each field. */
		fields?: Record<string, string> | null;
		busy?: boolean;
		onsubmit?: () => void;
	};
	let { values, dropzones, rigs, planes = [], locked = false, action, submitLabel, error, fields, busy = $bindable(false) }: Props = $props();
	const fe = (name: string) => fields?.[name] ?? null;
	let formEl: HTMLFormElement | undefined = $state();

	// svelte-ignore state_referenced_locally
	let dz = $state(
		values.dropzoneId ??
			(values.location
				? (dropzones.find((d) => d.name.toLowerCase() === values.location!.trim().toLowerCase())?.id ?? '')
				: (dropzones[0]?.id ?? ''))
	);
	const ffText = (s: number | string | null) => (s == null ? '' : String(s));
</script>

<form
	method="POST"
	{action}
	class="space-y-5"
	data-testid="jump-form"
	bind:this={formEl}
	use:enhance={() => {
		busy = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			busy = false;
			// Take the jumper to the first field that needs fixing (the alert sits by the button).
			if (result.type === 'failure') formEl?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
		};
	}}
>
	<div class="grid grid-cols-2 gap-3 sm:gap-4">
		<Input label="Jump #" name="jumpNumber" type="number" inputmode="numeric" min="1" value={values.jumpNumber} readonly={locked} required error={fe('jumpNumber')} />
		<Input label="Date" name="jumpDate" type="date" min="1900-01-01" value={values.jumpDate} readonly={locked} required error={fe('jumpDate')} />
	</div>

	<div class="space-y-2">
		<Select
			label="Dropzone"
			name="dropzoneId"
			bind:value={dz}
			disabled={locked}
			error={fe('dropzoneId')}
			options={[...dropzones.map((d) => ({ value: d.id, label: d.name })), { value: '', label: 'Other location…' }]}
		/>
		{#if locked}<input type="hidden" name="dropzoneId" value={dz} />{/if}
		{#if dz === ''}
			<Input name="location" placeholder="e.g. Skydive Mossel Bay, boogie, demo jump" value={values.location ?? ''} aria-label="Location" required error={fe('location')} />
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
		<Input label="Aircraft" name="aircraft" placeholder="C182, Caravan…" value={values.aircraft ?? ''} readonly={locked} list={!locked && planes.length ? 'aircraft-suggestions' : undefined} autocomplete="off" class="col-span-2 sm:col-span-1" />
		{#if !locked && planes.length}
			<datalist id="aircraft-suggestions" data-testid="aircraft-suggestions">
				{#each planes as p (p)}<option value={p}></option>{/each}
			</datalist>
		{/if}
		<Input label="Altitude (ft)" name="altitudeFt" type="number" inputmode="numeric" min="0" max="40000" step="100" value={values.altitudeFt ?? ''} error={fe('altitudeFt')} />
		<Input label="Freefall (sec)" name="freefallSeconds" inputmode="numeric" placeholder="45 or 0:45" value={ffText(values.freefallSeconds)} error={fe('freefallSeconds')} />
	</div>

	<fieldset class="min-w-0" aria-describedby={fe('jumpType') ? 'jump-type-error' : undefined}>
		<legend class="mb-2 text-sm font-medium">Jump type</legend>
		<div class="flex flex-wrap gap-1.5">
			{#each JUMP_TYPES as t (t)}
				<label class="relative cursor-pointer">
					<input type="radio" name="jumpType" value={t} checked={values.jumpType === t} class="peer sr-only" />
					<span class={cn('inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm text-muted transition-colors hover:border-border-strong peer-checked:border-primary/50 peer-checked:bg-primary/10 peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-ring')}>{JUMP_TYPE_LABELS[t]}</span>
				</label>
			{/each}
		</div>
		{#if fe('jumpType')}<p id="jump-type-error" class="mt-1.5 text-sm text-danger">{fe('jumpType')}</p>{/if}
	</fieldset>

	{#if rigs.length}
		<Select label="Rig" name="rigId" value={values.rigId ?? ''} options={[{ value: '', label: 'Not set' }, ...rigs.filter((r) => r.active || r.id === values.rigId).map((r) => ({ value: r.id, label: r.name }))]} />
	{/if}

	<Textarea label="Description" name="description" value={values.description ?? ''} placeholder="Jump description… what you worked on, who you jumped with." rows={4} />

	<FormAlert message={error} />
	<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button type="submit" size="lg" loading={busy} class="w-full sm:w-auto" data-testid="save-jump">{submitLabel}</Button>
	</div>
</form>
