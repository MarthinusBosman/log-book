<script lang="ts">
	import { Icon, cn } from '#lib/ui/index.ts';

	type Step = { id: string; title: string; body: string; href: string; done: boolean; optional?: boolean };
	let { steps, dropzoneName, class: className }: { steps: Step[]; dropzoneName: string; class?: string } = $props();

	const done = $derived(steps.filter((s) => s.done).length);
	const next = $derived(steps.find((s) => !s.done && !s.optional) ?? steps.find((s) => !s.done));
</script>

<section class={cn('rounded-2xl border border-primary/25 bg-linear-to-br from-primary/10 via-surface to-surface p-5', className)} aria-labelledby="setup-title" data-testid="setup-checklist">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="text-xs font-medium tracking-wider text-primary uppercase">Get ready to fly</p>
			<h2 id="setup-title" class="mt-1 text-lg font-semibold tracking-tight">Set up {dropzoneName}</h2>
			<p class="text-sm text-muted">{done} of {steps.length} done — this card disappears once the essentials are set.</p>
		</div>
		<div class="h-2 w-full overflow-hidden rounded-full bg-surface-2 sm:w-48" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
			<div class="h-full rounded-full bg-primary transition-[width]" style="width: {(done / steps.length) * 100}%"></div>
		</div>
	</div>
	<ol class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
		{#each steps as s (s.id)}
			<li>
				<a
					href={s.href}
					class={cn(
						'flex h-full items-start gap-3 rounded-xl border p-3 transition-colors',
						s.done ? 'border-border bg-surface/60 text-muted' : 'border-border bg-surface hover:border-primary/40 hover:bg-primary/5',
						s === next && 'border-primary/40 ring-2 ring-primary/15'
					)}
				>
					<span class={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border', s.done ? 'border-success bg-success text-bg' : 'border-border-strong')}>
						{#if s.done}<Icon name="check" class="size-3" />{/if}
					</span>
					<span class="min-w-0">
						<span class={cn('block text-sm font-medium', s.done ? 'line-through decoration-subtle' : 'text-fg')}>{s.title}{#if s.optional && !s.done}<span class="ml-1.5 text-xs font-normal text-subtle">optional</span>{/if}</span>
						<span class="block text-xs text-muted">{s.body}</span>
					</span>
					<span class="sr-only">{s.done ? '(done)' : '(to do)'}</span>
				</a>
			</li>
		{/each}
	</ol>
</section>
