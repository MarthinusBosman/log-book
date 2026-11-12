<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, EmptyState, Icon, Input, Select, cn } from '#lib/ui/index.ts';
	import { toastEnhance } from '#lib/components/tandems/enhance.ts';
	import { WEEKDAY_LABELS, fmtDay } from '#lib/components/tandems/model.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let mode = $state<'dated' | 'weekly'>('dated');
	let busy = $state(false);
	let showAll = $state(false);

	const visible = $derived(showAll ? data.dated : data.dated.slice(0, 14));
	const totals = $derived.by(() => {
		let cap = 0;
		let booked = 0;
		for (const d of data.dated) for (const s of d.slots) ((cap += s.capacity), (booked += s.booked));
		return { cap, booked, days: data.dated.length };
	});
	const weekdayOptions = WEEKDAY_LABELS.map((label, i) => ({ value: String(i), label }));
	const byWeekday = $derived(WEEKDAY_LABELS.map((label, i) => ({ label, slots: data.recurring.filter((r) => r.weekday === i) })));
</script>

<svelte:head><title>Booking slots · Tandems</title></svelte:head>

<Button variant="ghost" size="sm" href="/app/tandems" class="-ml-2 mb-3"><span aria-hidden="true">‹</span> Tandems</Button>
<div class="flex flex-wrap items-center gap-3">
	<span class="hidden size-10 place-items-center rounded-xl border border-border bg-surface text-primary sm:grid"><Icon name="calendar" /></span>
	<div class="mr-auto">
		<h1 class="text-2xl font-semibold tracking-tight">Booking slots</h1>
		<p class="text-sm text-muted">When customers can book a tandem online, and how many places each time has.</p>
	</div>
	<Button variant="secondary" href="/dz/{data.dz.slug}/book" target="_blank"><Icon name="globe" class="size-4" /> View booking page</Button>
</div>

<div class="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
	<!-- add -->
	<aside class="flex flex-col gap-4">
		<section class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="font-semibold">Add booking slots</h2>
			<div class="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm" role="tablist">
				{#each [['dated', 'By date'], ['weekly', 'Every week']] as [m, label] (m)}
					<button
						type="button"
						role="tab"
						aria-selected={mode === m}
						class={cn('rounded-lg py-1.5 font-medium transition-colors', mode === m ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
						onclick={() => (mode = m as 'dated' | 'weekly')}>{label}</button
					>
				{/each}
			</div>
			{#if mode === 'dated'}
				<form method="POST" action="?/add" use:enhance={toastEnhance({ pending: (on) => (busy = on) })} class="mt-4 grid grid-cols-2 gap-3">
					<Input label="Date" name="date" type="date" min={data.today} value={data.today} required class="col-span-2" />
					<Input label="Time" name="time" type="time" value="09:00" required />
					<Input label="Places" name="capacity" type="number" min="1" max="99" value="4" required />
					<Select
						label="Repeat"
						name="repeat"
						class="col-span-2"
						value="none"
						options={[
							{ value: 'none', label: 'Just this date' },
							{ value: 'daily', label: 'Every day for 30 days' },
							{ value: 'weekly', label: 'Same weekday for 5 weeks' }
						]}
					/>
					<Button type="submit" loading={busy} class="col-span-2"><Icon name="plus" class="size-4" /> Add slots</Button>
				</form>
			{:else}
				<form method="POST" action="?/weekly" use:enhance={toastEnhance({ pending: (on) => (busy = on) })} class="mt-4 grid grid-cols-2 gap-3">
					<Select label="Weekday" name="weekday" value="5" options={weekdayOptions} class="col-span-2" />
					<Input label="Time" name="time" type="time" value="09:00" required />
					<Input label="Places" name="capacity" type="number" min="1" max="99" value="4" required />
					<p class="col-span-2 text-xs text-muted">Recurring slots apply every week. A dated slot at the same time overrides it for that day.</p>
					<Button type="submit" loading={busy} class="col-span-2"><Icon name="plus" class="size-4" /> Add weekly slot</Button>
				</form>
			{/if}
		</section>

		<section class="grid grid-cols-3 gap-2 text-center">
			{#each [['Days', totals.days], ['Places', totals.cap], ['Booked', totals.booked]] as [label, n] (label)}
				<div class="rounded-2xl border border-border bg-surface px-3 py-3">
					<p class="text-xl font-semibold tabular-nums">{n}</p>
					<p class="text-xs text-muted">{label}</p>
				</div>
			{/each}
		</section>
		<p class="text-xs text-subtle">Next {data.horizon} days. Removing a slot keeps existing bookings — they stay on their date and time.</p>
	</aside>

	<div class="flex flex-col gap-6">
		<!-- weekly -->
		<section>
			<h2 class="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-subtle uppercase">Every week</h2>
			{#if data.recurring.length}
				<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
					{#each byWeekday.filter((d) => d.slots.length) as d (d.label)}
						<div class="rounded-2xl border border-border bg-surface p-3">
							<p class="text-sm font-medium">{d.label}</p>
							<ul class="mt-2 flex flex-wrap gap-1.5">
								{#each d.slots as s (s.id)}
									<li class="flex items-center gap-1 rounded-lg border border-border bg-surface-2/60 py-1 pr-1 pl-2.5 text-sm">
										<span class="font-mono tabular-nums">{s.time}</span>
										<span class="text-xs text-muted">· {s.capacity}</span>
										<form method="POST" action="?/delete" use:enhance={toastEnhance()}>
											<input type="hidden" name="id" value={s.id} />
											<button type="submit" class="grid size-6 place-items-center rounded-md text-subtle hover:bg-danger/10 hover:text-danger" aria-label="Remove {d.label} {s.time}">×</button>
										</form>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{:else}
				<p class="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted">No recurring weekly slots.</p>
			{/if}
		</section>

		<!-- dated -->
		<section>
			<h2 class="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-subtle uppercase">By date</h2>
			{#if data.dated.length}
				<ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
					{#each visible as d (d.date)}
						<li class="grid gap-2 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:items-center" data-testid="slot-day">
							<p class="text-sm font-medium">
								{fmtDay(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}
								{#if d.date === data.today}<Badge tone="brand" class="ml-1">Today</Badge>{/if}
							</p>
							<ul class="flex flex-wrap gap-2">
								{#each d.slots as s (s.id)}
									{@const full = s.booked >= s.capacity}
									<li
										class={cn(
											'flex items-center gap-1.5 rounded-xl border py-1 pr-1 pl-2.5 text-sm',
											full ? 'border-warning/40 bg-warning/10' : 'border-border bg-surface-2/50'
										)}
									>
										<span class="font-mono font-medium tabular-nums">{s.time}</span>
										<form method="POST" action="?/capacity" use:enhance={toastEnhance()} class="flex items-center gap-1">
											<input type="hidden" name="id" value={s.id} />
											<span class="text-xs text-muted tabular-nums" title="booked / places">{s.booked} /</span>
											<input
												name="capacity"
												type="number"
												min="1"
												max="99"
												value={s.capacity}
												aria-label="Places at {s.time}"
												class="h-7 w-9 [appearance:textfield] rounded-md border border-transparent bg-transparent px-1 text-center text-sm tabular-nums outline-none hover:border-border focus:border-primary [&::-webkit-inner-spin-button]:appearance-none"
												onchange={(e) => e.currentTarget.form?.requestSubmit()}
											/>
										</form>
										<form method="POST" action="?/delete" use:enhance={toastEnhance({ before: () => (s.booked && !confirm(`${s.booked} booking(s) at ${s.time} will keep their time. Remove the slot?`) ? false : null) })}>
											<input type="hidden" name="id" value={s.id} />
											<button type="submit" class="grid size-7 place-items-center rounded-md text-subtle hover:bg-danger/10 hover:text-danger" aria-label="Remove {d.date} {s.time}">×</button>
										</form>
									</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ul>
				{#if data.dated.length > visible.length}
					<Button variant="ghost" size="sm" class="mt-2" onclick={() => (showAll = true)}>Show all {data.dated.length} days</Button>
				{/if}
			{:else}
				<EmptyState title="No dated booking slots" description="Add slots on the left so customers can book online.">
					{#snippet icon()}<Icon name="calendar" class="size-6" />{/snippet}
				</EmptyState>
			{/if}
		</section>
	</div>
</div>
