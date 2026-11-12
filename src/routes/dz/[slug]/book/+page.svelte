<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { Button, Icon, Input, Select, cn, toast } from '#lib/ui/index.ts';
	import { formatMoney, type SlotExtra } from '#lib/domain/constants.ts';
	import BookingSteps from '#lib/components/tandems/BookingSteps.svelte';
	import MonthCalendar from '#lib/components/tandems/MonthCalendar.svelte';
	import { EXTRA_COPY, ageOn, fmtDay, limitWarnings } from '#lib/components/tandems/model.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Jumper = {
		name: string;
		email: string;
		phone: string;
		dob: string;
		weightKg: number | null;
		heightCm: number | null;
		emergencyName: string;
		emergencyPhone: string;
		guardianName: string;
		guardianEmail: string;
		guardianIdNumber: string;
		extras: SlotExtra[];
	};
	const blank = (): Jumper => ({
		name: '',
		email: '',
		phone: '',
		dob: '',
		weightKg: null,
		heightCm: null,
		emergencyName: '',
		emergencyPhone: '',
		guardianName: '',
		guardianEmail: '',
		guardianIdNumber: '',
		extras: []
	});

	const STEPS = ['date', 'details', 'extras'] as const;
	let step = $state(0);
	const initialDate = () => data.initialDate;
	let date = $state<string | null>(initialDate());
	let time = $state<string | null>(null);
	let count = $state(1);
	let jumpers = $state<Jumper[]>([blank()]);
	const firstProvider = () => data.providers[0]?.id ?? 'manual';
	let provider = $state<string>(firstProvider());
	let payWhat = $state<'deposit' | 'full'>('deposit');
	let busy = $state(false);
	let formEl: HTMLFormElement | undefined = $state();
	let top: HTMLDivElement | undefined = $state();


	const available = $derived(Object.fromEntries(Object.entries(data.days).map(([d, s]) => [d, s.reduce((n, x) => n + x.remaining, 0)])));
	const times = $derived(date ? (data.days[date] ?? []) : []);
	const slotLeft = $derived(times.find((t) => t.time === time)?.remaining ?? 0);
	const maxCount = $derived(Math.min(data.maxJumpers, Math.max(1, slotLeft || data.maxJumpers)));

	$effect(() => {
		// keep the jumpers array in step with the count
		if (jumpers.length < count) jumpers.push(...Array.from({ length: count - jumpers.length }, blank));
		else if (jumpers.length > count) jumpers.length = count;
	});
	$effect(() => {
		if (count > maxCount) count = maxCount;
	});

	const money = (m: number) => formatMoney(m, data.dz.currency);
	const extraPrice = (code: SlotExtra) => data.offer.extras.find((e) => e.code === code)?.priceMinor ?? 0;
	const perJumper = $derived(jumpers.map((j) => data.offer.baseMinor + j.extras.reduce((n, e) => n + extraPrice(e), 0)));
	const total = $derived(perJumper.reduce((a, b) => a + b, 0));
	const deposit = $derived(data.offer.depositMinor * count);
	const online = $derived(provider !== 'manual');
	const dueNow = $derived(!online ? 0 : payWhat === 'full' || deposit === 0 ? total : deposit);
	const providerLabel = $derived(data.providers.find((p) => p.id === provider)?.label ?? '');
	const first = (j: Jumper, i: number) => j.name.trim().split(/\s+/)[0] || `Jumper ${i + 1}`;
	const isMinor = (j: Jumper) => !!j.dob && !!date && ageOn(j.dob, date) < 18;

	function toggleExtra(i: number, code: SlotExtra) {
		const j = jumpers[i];
		j.extras = j.extras.includes(code) ? j.extras.filter((e) => e !== code) : [...j.extras, code];
	}

	async function go(to: number) {
		step = to;
		await tick();
		top?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	/** Native validation for the visible step + a few custom rules. */
	function validStep(): boolean {
		if (step === 0) {
			if (!date || !time) {
				toast.error('Please choose a date and a time');
				return false;
			}
			if (slotLeft < count) {
				toast.error(`Only ${slotLeft} place${slotLeft === 1 ? '' : 's'} left at ${time}`);
				return false;
			}
			return true;
		}
		const fs = formEl?.querySelector<HTMLFieldSetElement>(`fieldset[data-step="${step}"]`);
		if (!fs) return true;
		for (const el of fs.querySelectorAll<HTMLInputElement>('input[data-dob]')) {
			const age = el.value && date ? ageOn(el.value, date) : 99;
			el.setCustomValidity(age < data.minAge ? `Tandem passengers must be at least ${data.minAge} on the jump date` : '');
		}
		for (const el of fs.querySelectorAll<HTMLInputElement>('input[data-weight]')) {
			const w = Number(el.value);
			el.setCustomValidity(w > data.limits.maxWeightKg ? `The tandem weight limit is ${data.limits.maxWeightKg} kg — please contact us` : '');
		}
		for (const el of fs.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) {
			if (!el.checkValidity()) {
				el.reportValidity();
				return false;
			}
		}
		return true;
	}
	function next() {
		if (validStep()) go(step + 1);
	}

	const inputCls =
		'h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15';
</script>

<svelte:head><title>Book a tandem · {data.dz.name}</title></svelte:head>

<div bind:this={top} class="mx-auto max-w-5xl scroll-mt-16 px-4 pt-6 pb-28 sm:px-6 lg:pb-12">
	<div class="max-w-2xl">
		<BookingSteps current={STEPS[step]} waiver={data.waiver} />
		<h1 class="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
			{step === 0 ? 'When would you like to jump?' : step === 1 ? 'Who’s jumping?' : 'Make it yours'}
		</h1>
		<p class="mt-1 text-sm text-muted">
			{step === 0
				? `Pick a day and time at ${data.dz.name}. Plan for about 3–4 hours on site.`
				: step === 1
					? 'We need these details for your safety briefing and the instructor.'
					: 'Add video or extras, then confirm your booking.'}
		</p>
	</div>

	<noscript><p class="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Online booking needs JavaScript. Please enable it, or call us to book.</p></noscript>

	<form
		bind:this={formEl}
		method="POST"
		action="?/book"
		novalidate
		use:enhance={({ cancel }) => {
			if (!validStep()) return cancel();
			busy = true;
			return async ({ result, update }) => {
				busy = false;
				if (result.type === 'failure') toast.error(String((result.data as { message?: string })?.message ?? 'Booking failed'));
				await update({ reset: false });
			};
		}}
		class="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]"
	>
		<input type="hidden" name="slot" value={date && time ? `${date}|${time}` : ''} />
		<input type="hidden" name="count" value={count} />

		<div class="min-w-0">
			<!-- 1. date + time -->
			<fieldset data-step="0" hidden={step !== 0} class="grid gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
				<legend class="sr-only">Date and time</legend>
				<div class="rounded-2xl border border-border bg-surface p-4">
					<MonthCalendar available={available} min={data.today} max={data.horizon} bind:value={date} onselect={() => (time = null)} />
				</div>
				<div class="flex flex-col gap-4">
					<div>
						<p class="text-sm font-medium">{date ? fmtDay(date, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Choose a day'}</p>
						{#if date}
							<div class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3" role="radiogroup" aria-label="Time">
								{#each times as t (t.time)}
									<button
										type="button"
										role="radio"
										aria-checked={time === t.time}
										disabled={!t.remaining}
										onclick={() => (time = t.time)}
										data-time={t.time}
										class={cn(
											'flex flex-col items-center rounded-xl border px-2 py-2.5 transition-all',
											time === t.time
												? 'border-primary bg-primary text-primary-fg shadow-glow'
												: t.remaining
													? 'border-border bg-surface hover:border-primary/60'
													: 'border-border bg-surface-2/40 text-subtle line-through'
										)}
									>
										<span class="font-mono text-base font-semibold tabular-nums">{t.time}</span>
										<span class={cn('text-[11px]', time === t.time ? 'text-white/80' : t.remaining <= 2 && t.remaining ? 'text-warning' : 'text-muted')}>
											{t.remaining ? `${t.remaining} left` : 'Full'}
										</span>
									</button>
								{/each}
							</div>
						{:else}
							<p class="mt-2 text-sm text-muted">Days with open places are highlighted.</p>
						{/if}
					</div>
					<div class="rounded-2xl border border-border bg-surface p-4">
						<p class="text-sm font-medium">How many jumpers?</p>
						<div class="mt-3 flex items-center gap-3">
							<Button size="icon" variant="secondary" onclick={() => (count = Math.max(1, count - 1))} disabled={count <= 1} aria-label="Fewer jumpers">−</Button>
							<span class="w-10 text-center text-2xl font-semibold tabular-nums" data-testid="count">{count}</span>
							<Button size="icon" variant="secondary" onclick={() => (count = Math.min(maxCount, count + 1))} disabled={count >= maxCount} aria-label="More jumpers">+</Button>
							<span class="text-sm text-muted">up to {maxCount}</span>
						</div>
					</div>
				</div>
			</fieldset>

			<!-- 2. passenger details -->
			<fieldset data-step="1" hidden={step !== 1} class="flex flex-col gap-4">
				<legend class="sr-only">Passenger details</legend>
				{#each jumpers as j, i (i)}
					{@const warn = limitWarnings(j, data.limits)}
					<section class="rounded-2xl border border-border bg-surface p-4 sm:p-5">
						<h2 class="flex items-center gap-2 font-semibold">
							<span class="grid size-7 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>
							{count > 1 ? (i === 0 ? 'Lead jumper' : `Jumper ${i + 1}`) : 'Your details'}
						</h2>
						<div class="mt-4 grid gap-3 sm:grid-cols-2">
							<Input label="Full name" name="j{i}_name" bind:value={j.name} required autocomplete={i === 0 ? 'name' : 'off'} class="sm:col-span-2" />
							<Input label="Email" name="j{i}_email" type="email" bind:value={j.email} required inputmode="email" autocomplete={i === 0 ? 'email' : 'off'} />
							<Input label="Mobile number" name="j{i}_phone" type="tel" bind:value={j.phone} required inputmode="tel" autocomplete={i === 0 ? 'tel' : 'off'} />
							<Input label="Date of birth" name="j{i}_dob" type="date" bind:value={j.dob} required min="1900-01-01" max={data.today} data-dob />
							<div class="grid grid-cols-2 gap-3">
								<Input label="Weight (kg)" name="j{i}_weightKg" type="number" inputmode="decimal" min="20" max="250" step="0.1" bind:value={j.weightKg} required data-weight />
								<Input label="Height (cm)" name="j{i}_heightCm" type="number" inputmode="numeric" min="80" max="250" bind:value={j.heightCm} />
							</div>
						</div>
						{#if warn.length}
							<p class="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning" role="status">
								{warn.join(' · ')}. Tandem limits are {data.limits.maxWeightKg} kg and {data.limits.minHeightCm}–{data.limits.maxHeightCm} cm.
							</p>
						{/if}
						{#if isMinor(j)}
							<div class="mt-4 grid gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3 sm:grid-cols-2">
								<p class="text-sm font-medium text-warning sm:col-span-2">Under 18 — a parent or guardian must sign too</p>
								<Input label="Guardian full name" name="j{i}_guardianName" bind:value={j.guardianName} required />
								<Input label="Guardian email" name="j{i}_guardianEmail" type="email" bind:value={j.guardianEmail} required />
								<Input label="Guardian ID / passport" name="j{i}_guardianIdNumber" bind:value={j.guardianIdNumber} required class="sm:col-span-2" />
							</div>
						{/if}
						<details class="group mt-4" open={i === 0}>
							<summary class="cursor-pointer list-none text-sm font-medium text-muted hover:text-fg">
								Emergency contact{i > 0 ? ' (defaults to the lead jumper’s)' : ''}
								<span class="text-subtle group-open:hidden">+</span>
							</summary>
							<div class="mt-3 grid gap-3 sm:grid-cols-2">
								<Input label="Name" name="j{i}_emergencyName" bind:value={j.emergencyName} required={i === 0} />
								<Input label="Phone" name="j{i}_emergencyPhone" type="tel" bind:value={j.emergencyPhone} required={i === 0} />
							</div>
						</details>
					</section>
				{/each}
			</fieldset>

			<!-- 3. extras + payment -->
			<fieldset data-step="2" hidden={step !== 2} class="flex flex-col gap-4">
				<legend class="sr-only">Extras and payment</legend>
				{#each jumpers as j, i (i)}
					<input type="hidden" name="j{i}_extras_present" value="1" />
					{#each j.extras as e (e)}<input type="hidden" name="j{i}_extras" value={e} />{/each}
				{/each}
				{#if data.offer.extras.length}
					<div class="grid gap-3 sm:grid-cols-2">
						{#each data.offer.extras as e (e.code)}
							{@const on = jumpers.filter((j) => j.extras.includes(e.code)).length}
							<div class={cn('flex flex-col rounded-2xl border p-4 transition-colors', on ? 'border-primary/50 bg-primary/5' : 'border-border bg-surface')}>
								<div class="flex items-start gap-3">
									<div class="min-w-0 flex-1">
										<p class="font-medium">{EXTRA_COPY[e.code].title}</p>
										<p class="mt-0.5 text-sm text-muted">{EXTRA_COPY[e.code].blurb}</p>
									</div>
									<p class="shrink-0 text-sm font-semibold tabular-nums">+{money(e.priceMinor)}</p>
								</div>
								<div class="mt-3 flex flex-wrap gap-1.5">
									{#each jumpers as j, i (i)}
										{@const sel = j.extras.includes(e.code)}
										<button
											type="button"
											aria-pressed={sel}
											onclick={() => toggleExtra(i, e.code)}
											data-extra="{e.code}-{i}"
											class={cn(
												'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
												sel ? 'border-primary bg-primary text-primary-fg' : 'border-border bg-surface-2/60 text-muted hover:text-fg'
											)}
										>
											{#if sel}<Icon name="check" class="size-3.5" />{:else}<Icon name="plus" class="size-3.5" />{/if}
											{count > 1 ? first(j, i) : sel ? 'Added' : 'Add'}
										</button>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<section class="rounded-2xl border border-border bg-surface p-4 sm:p-5">
					<h2 class="font-semibold">Payment</h2>
					<div class="mt-3 grid gap-2">
						{#each data.providers as p (p.id)}
							<label class="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5">
								<input type="radio" name="provider" value={p.id} bind:group={provider} class="mt-1 size-4 accent-[var(--dz-primary)]" data-testid="provider-{p.id}" />
								<span class="min-w-0 flex-1">
									<span class="flex items-center gap-2 font-medium">
										{p.id === 'manual' ? p.label : `Pay online with ${p.label}`}
										{#if p.id !== 'manual'}<Icon name="shield" class="size-3.5 text-success" />{/if}
									</span>
									<span class="text-sm text-muted">{p.description}</span>
								</span>
							</label>
						{/each}
					</div>
					{#if online && deposit > 0}
						<div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How much to pay now">
							{#each [{ id: 'deposit', title: `Deposit · ${money(deposit)}`, note: 'Pay the rest at the dropzone' }, { id: 'full', title: `Full price · ${money(total)}`, note: 'Nothing left to pay on the day' }] as o (o.id)}
								<label class="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5">
									<input type="radio" name="pay" value={o.id} bind:group={payWhat} class="mt-1 size-4 accent-[var(--dz-primary)]" data-testid="pay-{o.id}" />
									<span class="min-w-0 text-sm"><span class="block font-medium tabular-nums">{o.title}</span><span class="text-muted">{o.note}</span></span>
								</label>
							{/each}
						</div>
					{:else if online}
						<input type="hidden" name="pay" value="full" />
					{/if}
					{#if data.offer.depositMinor > 0}
						<p class="mt-3 text-sm text-muted">
							A deposit of <span class="font-medium text-fg">{money(data.offer.depositMinor)}</span> per jumper secures your place. It’s non-refundable if you cancel within 48 hours.
						</p>
					{/if}
					{#if online}
						<p class="mt-2 text-xs text-subtle">You’ll be taken to {providerLabel}’s secure page. Your payment goes straight to {data.dz.name}.</p>
					{/if}
				</section>

				<section class="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 sm:p-5">
					<Select label="How did you hear about us?" name="j0_heardFrom" value="" options={[{ value: '', label: 'Choose…' }, ...data.heardFrom.map((h) => ({ value: h, label: h }))]} />
					<div class="flex flex-col gap-1.5 sm:col-span-2">
						<label for="note" class="text-sm font-medium">Anything we should know? <span class="font-normal text-subtle">(optional)</span></label>
						<textarea id="note" name="j0_note" rows="2" class="{inputCls} h-auto py-2.5" placeholder="Celebrating a birthday, nervous flyer, travelling together…"></textarea>
					</div>
					<label class="flex items-start gap-3 text-sm sm:col-span-2">
						<input type="checkbox" name="terms" required class="mt-0.5 size-5 shrink-0 accent-[var(--dz-primary)]" data-testid="terms" />
						<span class="text-muted">I understand the jump is weather dependent and may be rescheduled, and that every jumper must sign an indemnity before jumping.</span>
					</label>
				</section>
			</fieldset>

			<!-- nav -->
			<div class="mt-6 hidden items-center gap-3 lg:flex">
				{#if step > 0}<Button variant="ghost" onclick={() => go(step - 1)}><span aria-hidden="true">‹</span> Back</Button>{/if}
				<div class="ml-auto">
					{#if step < 2}
						<Button size="lg" onclick={next} data-testid="next">Continue <Icon name="arrowRight" class="size-4" /></Button>
					{:else}
						<Button size="lg" type="submit" loading={busy} data-testid="confirm">{online ? `Book & pay ${money(dueNow)}` : 'Confirm booking'}</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- summary -->
		<aside class="hidden lg:block">
			<div class="sticky top-20 rounded-2xl border border-border bg-surface p-5">
				<p class="text-xs font-semibold tracking-wider text-subtle uppercase">Your booking</p>
				<p class="mt-2 font-semibold">{data.dz.name}</p>
				<p class="text-sm text-muted">
					{date ? fmtDay(date, { weekday: 'short', day: 'numeric', month: 'long' }) : 'Choose a date'}{time ? ` · ${time}` : ''}
				</p>
				<dl class="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
					{#each jumpers as j, i (i)}
						<div class="flex justify-between gap-2">
							<dt class="truncate text-muted">{count > 1 || j.name ? first(j, i) : 'Tandem skydive'}{j.extras.length ? ` + ${j.extras.length}` : ''}</dt>
							<dd class="tabular-nums">{money(perJumper[i])}</dd>
						</div>
					{/each}
					<div class="flex justify-between border-t border-border pt-2 text-base font-semibold">
						<dt>Total</dt>
						<dd class="tabular-nums" data-testid="total">{money(total)}</dd>
					</div>
					{#if deposit > 0}
						<div class="flex justify-between text-xs text-muted"><dt>Deposit</dt><dd class="tabular-nums">{money(deposit)}</dd></div>
					{/if}
					<div class="flex justify-between text-xs text-muted"><dt>Due today</dt><dd class="tabular-nums" data-testid="due-now">{online ? `${money(dueNow)} · online` : `${money(0)} · pay at the DZ`}</dd></div>
				</dl>
			</div>
		</aside>

		<!-- mobile bar -->
		<div class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur-xl lg:hidden">
			<div class="mx-auto flex max-w-5xl items-center gap-3">
				{#if step > 0}
					<Button variant="secondary" size="icon" onclick={() => go(step - 1)} aria-label="Back"><span aria-hidden="true">‹</span></Button>
				{/if}
				<div class="min-w-0 flex-1 leading-tight">
					<p class="text-base font-semibold tabular-nums">{money(total)}</p>
					<p class="truncate text-xs text-muted">{count} jumper{count === 1 ? '' : 's'}{date ? ` · ${fmtDay(date)}` : ''}{time ? ` ${time}` : ''}</p>
				</div>
				{#if step < 2}
					<Button onclick={next} data-testid="next-mobile">Continue</Button>
				{:else}
					<Button type="submit" loading={busy} data-testid="confirm-mobile">{online ? `Pay ${money(dueNow)}` : 'Confirm booking'}</Button>
				{/if}
			</div>
		</div>
	</form>
</div>
