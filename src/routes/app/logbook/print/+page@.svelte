<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '#lib/ui/index.ts';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { fmtDate, fmtFreefall, fmtNumber } from '#lib/components/jumper/format.ts';
	import { JUMP_TYPE_LABELS, type JumpType } from '#lib/domain/constants.ts';
	import { brand } from '#lib/brand.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	onMount(() => {
		if (new URLSearchParams(location.search).has('auto')) setTimeout(() => print(), 300);
	});
</script>

<svelte:head><title>Logbook — {data.owner.name}</title></svelte:head>

<div class="mx-auto max-w-5xl bg-bg px-4 py-6 text-fg print:max-w-none print:bg-white print:p-0 print:text-black">
	<div class="mb-6 flex items-center justify-between gap-3 print:hidden">
		<a href="/app/logbook" class="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><JIcon name="chevronLeft" class="size-4" /> Logbook</a>
		<Button onclick={() => print()}><JIcon name="printer" class="size-4" /> Print / save as PDF</Button>
	</div>

	<header class="flex flex-wrap items-end justify-between gap-4 border-b-2 border-fg pb-3 print:border-black">
		<div>
			<p class="text-xs tracking-widest text-muted uppercase print:text-neutral-600">Skydiving logbook</p>
			<h1 class="text-2xl font-semibold tracking-tight">{data.owner.name}</h1>
			<p class="text-sm text-muted print:text-neutral-700">
				{[data.owner.licence ? `Licence ${data.owner.licence}` : null, data.owner.association].filter(Boolean).join(' · ') || ' '}
			</p>
		</div>
		<dl class="flex gap-6 text-right text-sm">
			<div><dt class="text-muted print:text-neutral-600">Total jumps</dt><dd class="text-lg font-semibold tabular-nums">{fmtNumber(data.totals.totalJumps)}</dd></div>
			<div><dt class="text-muted print:text-neutral-600">Freefall</dt><dd class="text-lg font-semibold tabular-nums">{fmtFreefall(data.totals.totalFreefallSeconds)}</dd></div>
			<div><dt class="text-muted print:text-neutral-600">Signed</dt><dd class="text-lg font-semibold tabular-nums">{data.totals.signed}</dd></div>
		</dl>
	</header>

	<table class="mt-4 w-full border-collapse text-[13px] print:text-[10.5px]" data-testid="print-table">
		<thead>
			<tr class="border-b border-border text-left text-xs text-muted uppercase print:border-black print:text-neutral-700">
				<th class="py-2 pr-2 font-medium">#</th>
				<th class="py-2 pr-2 font-medium">Date</th>
				<th class="py-2 pr-2 font-medium">Place</th>
				<th class="py-2 pr-2 font-medium">Aircraft</th>
				<th class="py-2 pr-2 text-right font-medium">Alt (ft)</th>
				<th class="py-2 pr-2 text-right font-medium">FF</th>
				<th class="py-2 pr-2 font-medium">Type</th>
				<th class="py-2 pr-2 font-medium">Description</th>
				<th class="py-2 font-medium">Signature</th>
			</tr>
		</thead>
		<tbody>
			{#each data.jumps as j (j.id)}
				<tr class="border-b border-border/70 align-top break-inside-avoid print:border-neutral-300">
					<td class="py-1.5 pr-2 font-medium tabular-nums">{j.jumpNumber}</td>
					<td class="py-1.5 pr-2 whitespace-nowrap tabular-nums">{fmtDate(j.jumpDate)}</td>
					<td class="py-1.5 pr-2">{j.place ?? ''}</td>
					<td class="py-1.5 pr-2">{j.aircraft ?? ''}</td>
					<td class="py-1.5 pr-2 text-right tabular-nums">{j.altitudeFt ? fmtNumber(j.altitudeFt) : ''}</td>
					<td class="py-1.5 pr-2 text-right tabular-nums">{j.freefallSeconds ? `${j.freefallSeconds}s` : ''}</td>
					<td class="py-1.5 pr-2">{j.jumpType ? (JUMP_TYPE_LABELS[j.jumpType as JumpType] ?? j.jumpType) : ''}</td>
					<td class="py-1.5 pr-2">{j.description ?? ''}</td>
					<td class="py-1.5 text-xs">
						{#if j.signedAt}{j.signerName}{j.signerLicence ? ` (${j.signerLicence})` : ''}{#if j.signatureUrl}<img src={j.signatureUrl} alt="Signature of {j.signerName}" class="mt-0.5 block h-7 max-w-32 object-contain dark:invert print:invert-0" />{/if}{:else if j.verified}DZ verified{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="9" class="py-8 text-center text-muted">No jumps.</td></tr>
			{/each}
		</tbody>
	</table>
	<p class="mt-4 text-xs text-muted print:text-neutral-600">Printed {fmtDate(data.printedOn)} from {brand.name}. {data.jumps.length} jumps.</p>
</div>
