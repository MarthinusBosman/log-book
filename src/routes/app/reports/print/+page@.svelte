<script lang="ts">
	import PrintSheet from '#lib/components/staffadmin/PrintSheet.svelte';
	import { brand } from '#lib/brand.ts';
	import { formatMoney } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const money = (m: number) => formatMoney(m, data.currency);
</script>

<PrintSheet title="Jump report {data.from} – {data.to}" back="/app/reports?from={data.from}&to={data.to}">
	<header class="flex items-start justify-between gap-4 border-b-2 border-zinc-900 pb-4">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Jump Report</h1>
			<p class="mt-1 text-sm">Dropzone: <b>{data.dzName}</b></p>
			<p class="text-sm">Range: <b>{data.from}</b> – <b>{data.to}</b></p>
		</div>
		<p class="text-right text-xs text-zinc-500">{brand.name}</p>
	</header>

	{#if data.loads === 0}
		<p class="py-16 text-center text-zinc-500">No loads found in that range.</p>
	{:else}
		<table class="mt-6 w-full text-sm">
			<thead>
				<tr class="border-b border-zinc-300 text-left">
					<th class="py-2 font-semibold">Item</th>
					<th class="py-2 text-right font-semibold">Count</th>
				</tr>
			</thead>
			<tbody>
				{#each data.summary as r (r.item)}
					<tr class="border-b border-zinc-200 {r.sub ? 'text-zinc-600' : 'font-semibold'}">
						<td class="py-1.5 {r.sub ? 'pl-6' : ''}">{r.item}</td>
						<td class="py-1.5 text-right tabular-nums">{r.count}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="mt-8 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
			<section class="break-inside-avoid">
				<h2 class="text-sm font-bold tracking-wide uppercase">Per day</h2>
				<table class="mt-2 w-full text-sm">
					<thead><tr class="border-b border-zinc-300 text-left"><th class="py-1.5">Day</th><th class="py-1.5 text-right">Loads</th><th class="py-1.5 text-right">Slots</th></tr></thead>
					<tbody>
						{#each data.perDay as d (d.day)}
							<tr class="border-b border-zinc-200"><td class="py-1 tabular-nums">{d.day}</td><td class="py-1 text-right tabular-nums">{d.loads}</td><td class="py-1 text-right tabular-nums">{d.slots}</td></tr>
						{/each}
					</tbody>
				</table>
			</section>
			<section class="break-inside-avoid">
				<h2 class="text-sm font-bold tracking-wide uppercase">Per aircraft</h2>
				<table class="mt-2 w-full text-sm">
					<thead><tr class="border-b border-zinc-300 text-left"><th class="py-1.5">Aircraft</th><th class="py-1.5 text-right">Loads</th><th class="py-1.5 text-right">Slots</th></tr></thead>
					<tbody>
						{#each data.perAircraft as a (a.aircraft)}
							<tr class="border-b border-zinc-200"><td class="py-1">{a.aircraft}</td><td class="py-1 text-right tabular-nums">{a.loads}</td><td class="py-1 text-right tabular-nums">{a.slots}</td></tr>
						{/each}
					</tbody>
				</table>
				<h2 class="mt-6 text-sm font-bold tracking-wide uppercase">Staff</h2>
				<table class="mt-2 w-full text-sm">
					<thead><tr class="border-b border-zinc-300 text-left"><th class="py-1.5">Name</th><th class="py-1.5 text-right">Jumps</th><th class="py-1.5 text-right">Pay</th></tr></thead>
					<tbody>
						{#each data.perStaff as s, i (i)}
							<tr class="border-b border-zinc-200"><td class="py-1">{s.name}</td><td class="py-1 text-right tabular-nums">{s.slots}</td><td class="py-1 text-right tabular-nums">{money(s.payMinor)}</td></tr>
						{/each}
					</tbody>
				</table>
			</section>
		</div>
	{/if}

	<footer class="mt-10 border-t border-zinc-200 pt-3 text-xs text-zinc-500">Generated on {data.generatedOn} with {brand.name}</footer>
</PrintSheet>
