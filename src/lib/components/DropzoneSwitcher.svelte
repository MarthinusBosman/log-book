<script lang="ts">
	import { page } from '$app/state';
	import type { Membership } from '#lib/types.ts';
	import { ROLE_LABELS, type DropzoneRole } from '#lib/domain/constants.ts';
	import { Icon, cn } from '#lib/ui/index.ts';

	let { memberships, current }: { memberships: Membership[]; current: Membership | null } = $props();

	let open = $state(false);
	let root: HTMLDivElement | undefined = $state();

	function onWindowClick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
	const roleLabel = (r: DropzoneRole) => ROLE_LABELS[r] ?? r;
	const initials = (n: string) =>
		n
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0])
			.join('')
			.toUpperCase();
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="relative" bind:this={root}>
	<button
		type="button"
		class="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2/50 p-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<span
			class="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500/30 to-brand-700/30 text-xs font-bold text-primary dark:text-brand-300 ring-1 ring-brand-500/30 ring-inset"
		>
			{current ? initials(current.dropzone.name) : '—'}
		</span>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm font-semibold text-fg">
				{current?.dropzone.name ?? 'No dropzone'}
			</span>
			<span class="block truncate text-xs text-muted">
				{current ? roleLabel(current.role) : 'Join or create one'}
			</span>
		</span>
		<Icon name="chevronsUpDown" class="size-4 text-subtle" />
	</button>

	{#if open}
		<div
			class="absolute inset-x-0 top-full z-50 mt-2 origin-top animate-slide-up rounded-xl border border-border bg-elevated p-1.5 shadow-2xl shadow-black/40"
			role="listbox"
		>
			{#if memberships.length}
				<p class="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wider text-subtle uppercase">
					Your dropzones
				</p>
				{#each memberships as m (m.dropzone.id)}
					{@const active = m.dropzone.id === current?.dropzone.id}
					<form method="POST" action="/app/switch-dropzone">
						<input type="hidden" name="slug" value={m.dropzone.slug} />
						<input type="hidden" name="redirectTo" value={page.url.pathname} />
						<button
							type="submit"
							role="option"
							aria-selected={active}
							class={cn(
								'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2',
								active ? 'text-fg' : 'text-muted'
							)}
						>
							<span class="min-w-0 flex-1 truncate">{m.dropzone.name}</span>
							<span class="text-xs text-subtle">{roleLabel(m.role)}</span>
							{#if active}<Icon name="check" class="size-4 text-primary" />{/if}
						</button>
					</form>
				{/each}
				<div class="my-1.5 h-px bg-border"></div>
			{/if}
			<a
				href="/app/dropzones/new"
				class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
				onclick={() => (open = false)}
			>
				<Icon name="plus" class="size-4" /> Create a dropzone
			</a>
		</div>
	{/if}
</div>
