<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, Dialog, Input, Select } from '#lib/ui/index.ts';
	import { page } from '$app/state';
	import { act } from './forms.ts';
	import { formAction } from './manifest.ts';

	type Plane = { id: string; name: string; capacity: number; weightLimitKg: number | null; defaultPilotId: string | null };
	type Props = {
		open?: boolean;
		day: string;
		aircraft: Plane[];
		pilots: { id: string; name: string; weightKg: number | null }[];
		defaultCapacity: number | null;
		oncreated?: (numbers: number[]) => void;
	};
	let { open = $bindable(false), day, aircraft, pilots, defaultCapacity, oncreated }: Props = $props();

	const first = untrack(() => ({ plane: aircraft[0], cap: defaultCapacity }));
	let aircraftId = $state(first.plane?.id ?? '');
	let pilotUserId = $state(first.plane?.defaultPilotId ?? '');
	let capacity = $state<number | ''>(first.plane?.capacity ?? first.cap ?? '');
	let weightLimit = $state<number | ''>(first.plane?.weightLimitKg ?? '');
	const pilotWeight = (id: string) => pilots.find((p) => p.id === id)?.weightKg ?? '';
	let pilotWeightKg = $state<number | ''>(untrack(() => pilotWeight(pilotUserId)));
	/** Choosing a pilot fills in their profile weight (still editable). */
	function pickPilot(id: string) {
		pilotUserId = id;
		pilotWeightKg = pilotWeight(id);
	}
	let busy = $state(false);

	const plane = $derived(aircraft.find((a) => a.id === aircraftId) ?? null);
	function pickPlane(id: string) {
		aircraftId = id;
		const p = aircraft.find((a) => a.id === id);
		if (p) {
			capacity = p.capacity;
			weightLimit = p.weightLimitKg ?? '';
			if (p.defaultPilotId) pickPilot(p.defaultPilotId);
		}
	}
</script>

<Dialog bind:open title="Create new load/s" description="Numbers continue from the day's existing loads." variant="right">
	<form
		method="POST"
		action={formAction(page.url, 'createLoad')}
		class="flex flex-col gap-4"
		id="create-load-form"
		use:enhance={act({
			pending: (b) => (busy = b),
			success: (d) => {
				const n = (d.created as number[]) ?? [];
				return n.length > 1 ? `Loads ${n[0]}–${n[n.length - 1]} created` : `Load ${n[0]} created`;
			},
			onSuccess: (d) => {
				open = false;
				oncreated?.((d.created as number[]) ?? []);
			}
		})}
	>
		<input type="hidden" name="day" value={day} />
		<Select
			label="Aircraft"
			name="aircraftId"
			value={aircraftId}
			onchange={(e) => pickPlane((e.currentTarget as HTMLSelectElement).value)}
			options={[...aircraft.map((a) => ({ value: a.id, label: `${a.name} · ${a.capacity} slots` })), { value: '', label: 'Custom plane…' }]}
		/>
		{#if !plane}
			<Input label="Airplane name / number" name="aircraftName" placeholder="e.g. ZS-ABC" required />
		{/if}
		<div class="grid grid-cols-2 gap-3">
			<Input label="Slots (pax)" name="capacity" type="number" min="1" max="60" bind:value={capacity} required />
			<Input label="Weight limit (kg)" name="weightLimitKg" type="number" min="0" step="1" bind:value={weightLimit} hint="Pilot included" />
		</div>
		<Select
			label="Pilot"
			name="pilotUserId"
			value={pilotUserId}
			onchange={(e) => pickPilot((e.currentTarget as HTMLSelectElement).value)}
			options={[{ value: '', label: pilots.length ? 'Other / none' : 'No pilot added in Staff yet' }, ...pilots.map((p) => ({ value: p.id, label: p.name }))]}
		/>
		{#if !pilotUserId}
			<Input label="Pilot name" name="pilotName" placeholder="Optional" />
		{/if}
		<div class="grid grid-cols-2 gap-3">
			<Input label="Pilot weight (kg)" name="pilotWeightKg" type="number" min="0" step="1" bind:value={pilotWeightKg} placeholder={pilotUserId ? 'From profile' : ''} />
			<Input label="Time" name="time" type="time" hint="Optional" />
		</div>
		<div class="grid grid-cols-2 gap-3">
			<Input label="Number of loads" name="count" type="number" min="1" max="20" value="1" />
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="req" class="text-sm font-medium">Load requirements <span class="font-normal text-subtle">(optional)</span></label>
			<textarea
				id="req"
				name="requirements"
				rows="2"
				class="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] outline-none hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15"
				placeholder="e.g. Sunset load, A-licence and up"
			></textarea>
		</div>
		<label class="flex items-start gap-3 rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
			<input type="checkbox" name="open" checked class="mt-0.5 size-4 accent-[var(--dz-primary)]" />
			<span><span class="font-medium">Open for jumpers</span><span class="block text-muted">Checked-in jumpers can self-manifest from their phones.</span></span>
		</label>
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="create-load-form" loading={busy}>Create load</Button>
	{/snippet}
</Dialog>
