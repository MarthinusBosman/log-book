<script lang="ts">
	/** Indemnity form builder for one audience: ordered sections, edit, reorder, delete, add, preview, activate. */
	import { enhance } from '$app/forms';
	import { Badge, Button, Dialog, Icon, Input, Select, cn } from '#lib/ui/index.ts';
	import { INDEMNITY_SECTION_TYPES, type IndemnityAudience, type IndemnitySectionType } from '#lib/domain/constants.ts';
	import { toastEnhance } from '#lib/components/tandems/enhance.ts';
	import { SECTION_TYPE_LABELS } from '#lib/components/tandems/model.ts';
	import WaiverForm from './WaiverForm.svelte';

	type Section = { id: string; title: string; content: string; type: IndemnitySectionType; position: number };
	type Props = { audience: IndemnityAudience; sections: Section[]; active: boolean; dropzoneName: string; canEdit: boolean };
	let { audience, sections, active, dropzoneName, canEdit }: Props = $props();

	let editing = $state<string | null>(null);
	let adding = $state(false);
	let previewing = $state(false);
	let busy = $state(false);
	let newType = $state<IndemnitySectionType>('acknowledgement');

	const typeOptions = INDEMNITY_SECTION_TYPES.map((t) => ({ value: t, label: SECTION_TYPE_LABELS[t] }));
	const TYPE_TONES: Record<IndemnitySectionType, 'neutral' | 'brand' | 'warning' | 'success'> = {
		text: 'neutral',
		acknowledgement: 'brand',
		initials: 'warning',
		signature: 'success'
	};
	const label = $derived(audience === 'tandem' ? 'Tandem passengers' : 'Sport jumpers');
	const where = $derived(
		audience === 'tandem' ? 'Signed in the online booking flow and on the passenger’s registration link.' : 'Jumpers sign this in the app before they can join loads.'
	);
	const textarea =
		'w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15';
</script>

<div class="flex flex-col gap-4" data-testid="builder-{audience}">
	<!-- status -->
	<div class={cn('flex flex-wrap items-center gap-3 rounded-2xl border p-4', active ? 'border-success/30 bg-success/5' : 'border-border bg-surface')}>
		<span class={cn('grid size-10 place-items-center rounded-xl', active ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted')}>
			<Icon name={active ? 'check' : 'waiver'} />
		</span>
		<div class="mr-auto min-w-0">
			<p class="font-semibold">{label} waiver <Badge tone={active ? 'success' : 'neutral'} dot class="ml-1">{active ? 'Active' : 'Off'}</Badge></p>
			<p class="text-sm text-muted">{where}</p>
		</div>
		<Button variant="secondary" size="sm" onclick={() => (previewing = true)} disabled={!sections.length}><Icon name="smartphone" class="size-4" /> Preview</Button>
		{#if canEdit}
			<form method="POST" action="?/activate" use:enhance={toastEnhance()}>
				<input type="hidden" name="audience" value={audience} />
				<input type="hidden" name="active" value={String(!active)} />
				<Button size="sm" variant={active ? 'outline' : 'primary'} type="submit" data-testid="toggle-{audience}">{active ? 'Switch off' : 'Activate'}</Button>
			</form>
		{/if}
	</div>

	<!-- sections -->
	<ol class="flex flex-col gap-2">
		{#each sections as s, i (s.id)}
			<li class="rounded-2xl border border-border bg-surface" data-testid="section">
				{#if editing === s.id}
					<form
						method="POST"
						action="?/update"
						use:enhance={toastEnhance({ pending: (on) => (busy = on), onSuccess: () => (editing = null) })}
						class="grid gap-3 p-4"
					>
						<input type="hidden" name="id" value={s.id} />
						<div class="grid gap-3 sm:grid-cols-[1fr_16rem]">
							<Input label="Heading" name="title" value={s.title} required />
							<Select label="Type" name="type" value={s.type} options={typeOptions} />
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="c-{s.id}" class="text-sm font-medium">Content</label>
							<textarea id="c-{s.id}" name="content" rows="5" class={textarea}>{s.content}</textarea>
						</div>
						<div class="flex justify-end gap-2">
							<Button variant="ghost" size="sm" onclick={() => (editing = null)}>Cancel</Button>
							<Button size="sm" type="submit" loading={busy}>Save section</Button>
						</div>
					</form>
				{:else}
					<div class="flex gap-3 p-4">
						<span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold text-muted tabular-nums">{i + 1}</span>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<h4 class="font-medium">{s.title}</h4>
								<Badge tone={TYPE_TONES[s.type]}>{SECTION_TYPE_LABELS[s.type]}</Badge>
							</div>
							{#if s.content}<p class="mt-1 line-clamp-3 text-sm whitespace-pre-line text-muted">{s.content}</p>{/if}
						</div>
						{#if canEdit}
							<div class="flex shrink-0 items-start gap-0.5">
								{#each [['up', '↑', i === 0], ['down', '↓', i === sections.length - 1]] as [dir, glyph, off] (dir)}
									<form method="POST" action="?/move" use:enhance={toastEnhance()}>
										<input type="hidden" name="id" value={s.id} />
										<input type="hidden" name="direction" value={dir} />
										<Button size="icon" variant="ghost" type="submit" disabled={off as boolean} aria-label="Move {s.title} {dir}" class="size-8">{glyph}</Button>
									</form>
								{/each}
								<Button size="icon" variant="ghost" class="size-8" aria-label="Edit {s.title}" onclick={() => (editing = s.id)}>✎</Button>
								<form method="POST" action="?/delete" use:enhance={toastEnhance({ before: () => (confirm(`Delete “${s.title}”?`) ? null : false) })}>
									<input type="hidden" name="id" value={s.id} />
									<Button size="icon" variant="ghost" type="submit" class="size-8 hover:text-danger" aria-label="Delete {s.title}">×</Button>
								</form>
							</div>
						{/if}
					</div>
				{/if}
			</li>
		{:else}
			<li class="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
				No sections yet. Add the clauses {audience === 'tandem' ? 'passengers' : 'jumpers'} must read, tick or initial.{#if active}<span class="mt-1 block text-warning">Until you do, nobody is asked to sign this form.</span>{/if}
			</li>
		{/each}
	</ol>

	{#if canEdit}
		{#if adding}
			<form
				method="POST"
				action="?/add"
				use:enhance={toastEnhance({ reset: true, pending: (on) => (busy = on), onSuccess: () => (adding = false) })}
				class="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4"
			>
				<input type="hidden" name="audience" value={audience} />
				<div class="grid gap-3 sm:grid-cols-[1fr_16rem]">
					<Input label="Heading" name="title" required placeholder="e.g. Assumption of risk" />
					<Select label="Type" name="type" bind:value={newType} options={typeOptions} />
				</div>
				<div class="flex flex-col gap-1.5">
					<label for="new-{audience}" class="text-sm font-medium">Content{newType === 'signature' ? ' (optional)' : ''}</label>
					<textarea id="new-{audience}" name="content" rows="5" class={textarea} required={newType !== 'signature'} placeholder="The clause text shown to the signer"></textarea>
				</div>
				<div class="flex justify-end gap-2">
					<Button variant="ghost" size="sm" onclick={() => (adding = false)}>Cancel</Button>
					<Button size="sm" type="submit" loading={busy}>Add section</Button>
				</div>
			</form>
		{:else}
			<Button variant="secondary" onclick={() => (adding = true)} class="self-start" data-testid="add-section-{audience}"><Icon name="plus" class="size-4" /> Add section</Button>
		{/if}
	{/if}
</div>

<Dialog bind:open={previewing} title="Preview — {label.toLowerCase()}" variant="right" class="!w-[min(40rem,100vw)]">
	<WaiverForm
		sections={sections}
		{dropzoneName}
		preview
		title={audience === 'tandem' ? 'Tandem Skydive Indemnity' : 'Skydiver Indemnity & Waiver'}
	/>
</Dialog>
