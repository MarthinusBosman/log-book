<script lang="ts">
	import { ROLE_LABELS, type DropzoneRole } from '#lib/domain/constants.ts';
	import { cn } from '#lib/ui/index.ts';

	type Props = { roles: { role: DropzoneRole; colour?: string | null }[] | DropzoneRole[]; max?: number; class?: string };
	let { roles, max = 99, class: className }: Props = $props();
	const list = $derived(roles.map((r) => (typeof r === 'string' ? { role: r, colour: null } : r)));
	const tone: Partial<Record<DropzoneRole, string>> = {
		owner: 'border-primary/30 bg-primary/10 text-primary',
		admin: 'border-primary/30 bg-primary/10 text-primary',
		manifest: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
		rigger: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
		pilot: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
		jumper: 'border-border bg-surface-2 text-muted'
	};
</script>

<span class={cn('inline-flex flex-wrap gap-1', className)}>
	{#each list.slice(0, max) as r (r.role)}
		<span
			class={cn(
				'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
				tone[r.role] ?? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
			)}
		>
			{#if r.colour}<span class="size-2 rounded-full" style="background:{r.colour}"></span>{/if}
			{ROLE_LABELS[r.role]}
		</span>
	{/each}
	{#if list.length > max}<span class="px-1 text-[11px] text-subtle">+{list.length - max}</span>{/if}
</span>
