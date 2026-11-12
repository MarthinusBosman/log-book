<script lang="ts">
	import PrintSheet from '#lib/components/staffadmin/PrintSheet.svelte';
	import { brand } from '#lib/brand.ts';
	import {
		JUMP_TYPE_LABELS,
		LOAD_STATUS_LABELS,
		SLOT_EXTRA_LABELS,
		SLOT_STAFF_ROLE_LABELS,
		type JumpType,
		type LoadStatus,
		type SlotExtra,
		type SlotStaffRole
	} from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const time = (d: Date | string | null) => (d ? new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : null);
	const shift = (n: number) => new Date(Date.parse(`${data.day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
</script>

<PrintSheet title="Load sheet {data.day}" back="/app/reports">
	<header class="flex flex-wrap items-start justify-between gap-4 border-b-2 border-zinc-900 pb-4">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Load Sheet</h1>
			<p class="mt-1 text-sm"><b>{data.dzName}</b> · {data.day}</p>
		</div>
		<form method="GET" class="flex items-center gap-2 text-sm print:hidden">
			<a href="?day={shift(-1)}" class="rounded-lg border border-zinc-300 px-2 py-1 hover:bg-zinc-100" aria-label="Previous day">←</a>
			<input type="date" name="day" value={data.day} class="rounded-lg border border-zinc-300 bg-white px-2 py-1" onchange={(e) => e.currentTarget.form?.requestSubmit()} />
			<a href="?day={shift(1)}" class="rounded-lg border border-zinc-300 px-2 py-1 hover:bg-zinc-100" aria-label="Next day">→</a>
			<noscript><button class="rounded-lg border border-zinc-300 px-2 py-1">Go</button></noscript>
		</form>
	</header>

	{#each data.loads as l (l.id)}
		<section class="mt-6 break-inside-avoid">
			<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-zinc-400 pb-1.5">
				<h2 class="text-lg font-bold">Load {l.loadNumber} <span class="text-sm font-normal text-zinc-600">· {l.aircraftName ?? 'No aircraft'}</span></h2>
				<p class="text-xs text-zinc-600">
					Pilot <b class="text-zinc-900">{l.pilotName ?? '—'}</b>
					· {l.stats.used}/{l.capacity} slots
					· {l.stats.weightKg} kg{l.weightLimitKg ? ` / ${l.weightLimitKg} kg` : ''}
					· {LOAD_STATUS_LABELS[l.status as LoadStatus] ?? l.status}
					{#if time(l.departedAt ?? l.scheduledAt)}· {time(l.departedAt ?? l.scheduledAt)}{/if}
				</p>
			</div>
			<table class="mt-1 w-full text-[13px]">
				<thead>
					<tr class="border-b border-zinc-300 text-left text-[11px] tracking-wide text-zinc-500 uppercase">
						<th class="w-8 py-1">#</th>
						<th class="py-1">Name</th>
						<th class="py-1">Licence</th>
						<th class="py-1">Jump</th>
						<th class="hidden py-1 sm:table-cell print:table-cell">Extras</th>
						<th class="py-1 text-right">kg</th>
						<th class="w-12 py-1 text-right">Paid</th>
					</tr>
				</thead>
				<tbody>
					{#each l.slots as s, i (s.id)}
						<tr class="border-b border-zinc-200">
							<td class="py-1 text-zinc-500 tabular-nums">{i + 1}</td>
							<td class="py-1 font-medium">
								{s.displayName}{#if s.isLoadMaster}<span class="ml-1 rounded bg-zinc-900 px-1 text-[10px] text-white">LM</span>{/if}
								{#if s.teamName}<span class="block text-[11px] font-normal text-zinc-500">{s.teamName}</span>{/if}
							</td>
							<td class="py-1">{s.licence ?? ''}</td>
							<td class="py-1">
								{JUMP_TYPE_LABELS[s.jumpType as JumpType] ?? s.jumpType}{#if s.staffRole}<span class="text-zinc-500"> · {SLOT_STAFF_ROLE_LABELS[s.staffRole as SlotStaffRole] ?? s.staffRole}</span>{/if}
							</td>
							<td class="hidden py-1 text-zinc-600 sm:table-cell print:table-cell">{(s.extras ?? []).map((e) => SLOT_EXTRA_LABELS[e as SlotExtra] ?? e).join(', ')}</td>
							<td class="py-1 text-right tabular-nums">{s.weightKg ?? ''}</td>
							<td class="py-1 text-right">{s.staffRole ? '' : s.paid ? '✓' : '—'}</td>
						</tr>
					{:else}
						<tr><td colspan="7" class="py-3 text-center text-zinc-500">Empty load</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	{:else}
		<p class="py-16 text-center text-zinc-500">No loads on {data.day}.</p>
	{/each}

	<footer class="mt-10 border-t border-zinc-200 pt-3 text-xs text-zinc-500">Printed {data.today} with {brand.name}</footer>
</PrintSheet>
