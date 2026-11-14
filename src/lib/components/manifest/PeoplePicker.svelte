<script lang="ts" module>
	export type Person = {
		id: string;
		name: string;
		avatar?: string | null;
		sub?: string | null;
		weightKg?: number | null;
		warn?: string | null;
		onLoad?: boolean;
		/** other loads that day this person is already on (load numbers) */
		alsoOn?: number[];
		colour?: string | null;
	};
</script>

<script lang="ts">
	import { Avatar } from '#lib/ui/index.ts';
	import { cn } from '#lib/ui/cn.ts';
	import MIcon from './MIcon.svelte';
	import { alsoOnLabel } from './manifest.ts';

	type Props = {
		people: Person[];
		selected?: string[];
		multiple?: boolean;
		name?: string;
		empty?: string;
		idPrefix: string;
	};
	let { people, selected = $bindable([]), multiple = true, name = 'userId', empty = 'Nobody here yet.', idPrefix }: Props = $props();
	let q = $state('');

	const filtered = $derived.by(() => {
		const t = q.trim().toLowerCase();
		return t ? people.filter((p) => p.name.toLowerCase().includes(t) || (p.sub ?? '').toLowerCase().includes(t)) : people;
	});
	function toggle(id: string, on: boolean) {
		if (!multiple) selected = on ? [id] : [];
		else selected = on ? [...selected, id] : selected.filter((x) => x !== id);
	}
</script>

<div class="flex flex-col gap-2">
	<div class="relative">
		<MIcon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
		<label class="sr-only" for="{idPrefix}-q">Search</label>
		<input
			id="{idPrefix}-q"
			type="search"
			bind:value={q}
			placeholder="Search name…"
			class="h-10 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-sm outline-none hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15"
			autocomplete="off"
		/>
	</div>
	<ul class="max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1" role="list">
		{#each filtered as p (p.id)}
			{@const on = selected.includes(p.id)}
			<li>
				<label
					class={cn(
						'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
						p.onLoad ? 'cursor-not-allowed opacity-50' : on ? 'bg-primary/10' : 'hover:bg-surface-2'
					)}
				>
					<input
						type={multiple ? 'checkbox' : 'radio'}
						{name}
						value={p.id}
						checked={on}
						disabled={p.onLoad}
						onchange={(e) => toggle(p.id, (e.currentTarget as HTMLInputElement).checked)}
						class="size-4 shrink-0 accent-[var(--dz-primary)]"
					/>
					<Avatar name={p.name} src={p.avatar} size="sm" />
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-1.5 truncate font-medium">
							{#if p.colour}<span class="size-2 rounded-full" style="background:{p.colour}"></span>{/if}{p.name}
						</span>
						{#if p.sub || p.onLoad}<span class="block truncate text-xs text-muted">{p.onLoad ? 'Already on this load' : p.sub}</span>{/if}
					</span>
					{#if p.warn}<span class="shrink-0 rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger uppercase">{p.warn}</span>{/if}
					{#if !p.onLoad && p.alsoOn?.length}
						<span class="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted" data-also-on title="Already manifested on another load today">
							{alsoOnLabel(p.alsoOn, true)}
						</span>
					{/if}
					{#if p.weightKg}<span class="shrink-0 text-xs text-subtle tabular-nums">{Math.round(p.weightKg)} kg</span>{/if}
				</label>
			</li>
		{:else}
			<li class="px-3 py-6 text-center text-sm text-muted">{q ? 'No match.' : empty}</li>
		{/each}
	</ul>
</div>
