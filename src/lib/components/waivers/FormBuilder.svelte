<script lang="ts">
	/** Indemnity form builder for one audience: ordered sections, edit, reorder, delete, add, preview, activate. */
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { openInPlace, viewParamsHref, wantsNewDialog } from '#lib/components/staffadmin/open-dialog.ts';
	import { syncViewToUrl } from '#lib/components/staffadmin/url-sync.svelte.ts';
	import { Badge, Button, Dialog, Icon, Input, Select, cn } from '#lib/ui/index.ts';
	import { INDEMNITY_SECTION_TYPES, type IndemnityAudience, type IndemnitySectionType } from '#lib/domain/constants.ts';
	import { toastEnhance } from '#lib/components/tandems/enhance.ts';
	import { SECTION_TYPE_LABELS } from '#lib/components/tandems/model.ts';
	import WaiverForm from './WaiverForm.svelte';

	type Section = { id: string; title: string; content: string; type: IndemnitySectionType; position: number };
	type Props = { audience: IndemnityAudience; sections: Section[]; active: boolean; dropzoneName: string; canEdit: boolean };
	let { audience, sections, active, dropzoneName, canEdit }: Props = $props();

	// Edit / Add section state lives in the URL (?edit=<id>, ?new=1) so the links work before
	// hydration and without JS (the server renders the form open); hydrated clicks act in place.
	let editing = $state<string | null>(page.url.searchParams.get('edit'));
	let adding = $state(wantsNewDialog(page.url.searchParams));
	const href = (set: Record<string, string | null>) => viewParamsHref(page.url, set);
	// No-JS posts land on the action URL: keep the tab so the page comes back on this form.
	const act = (name: string) => `?/${name}&tab=${audience}`;
	let previewing = $state(page.url.searchParams.get('preview') === '1');
	// Delete asks first (?delete=<id> shows an inline confirm), with or without JS.
	let deleting = $state<string | null>(page.url.searchParams.get('delete'));
	let busy = $state(false);
	let newType = $state<IndemnitySectionType>('acknowledgement');
	// Preview is a link too (?preview=1): the server renders the dialog open for no-JS taps.
	syncViewToUrl(() => ({ edit: editing, new: adding ? '1' : null, preview: previewing ? '1' : null, delete: deleting }), 0);

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
			<h2 class="font-semibold">{label} waiver <Badge tone={active ? 'success' : 'neutral'} dot class="ml-1">{active ? 'Active' : 'Off'}</Badge></h2>
			<p class="text-sm text-muted">{where}</p>
		</div>
		{#if sections.length}
			<Button variant="secondary" size="sm" href={href({ preview: '1' })} onclick={openInPlace(() => (previewing = true))} data-testid="preview-{audience}"
				><Icon name="smartphone" class="size-4" /> Preview</Button
			>
		{:else}
			<Button variant="secondary" size="sm" disabled><Icon name="smartphone" class="size-4" /> Preview</Button>
		{/if}
		{#if canEdit}
			<form method="POST" action={act('activate')} use:enhance={toastEnhance()}>
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
						action={act('update')}
						use:enhance={toastEnhance({ pending: (on) => (busy = on), onSuccess: () => (editing = null) })}
						class="grid gap-3 p-4"
					>
						<input type="hidden" name="id" value={s.id} />
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_16rem]">
							<Input label="Heading" name="title" value={s.title} required />
							<Select label="Type" name="type" value={s.type} options={typeOptions} />
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="c-{s.id}" class="text-sm font-medium">Content</label>
							<textarea id="c-{s.id}" name="content" rows="5" class={textarea}>{s.content}</textarea>
						</div>
						<div class="flex justify-end gap-2">
							<Button variant="ghost" size="sm" href={href({ edit: null })} onclick={openInPlace(() => (editing = null))}>Cancel</Button>
							<Button size="sm" type="submit" loading={busy}>Save section</Button>
						</div>
					</form>
				{:else}
					<!-- Phones: number + buttons share the first row and the text gets the full width below
					     (beside four icon buttons the clause text was a ~110 px column). -->
					<div class="flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap">
						<span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold text-muted tabular-nums">{i + 1}</span>
						<div class="order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1" data-testid="section-text">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="font-medium">{s.title}</h3>
								<Badge tone={TYPE_TONES[s.type]}>{SECTION_TYPE_LABELS[s.type]}</Badge>
							</div>
							{#if s.content}<p class="mt-1 line-clamp-3 text-sm whitespace-pre-line text-muted">{s.content}</p>{/if}
						</div>
						{#if canEdit}
							<div class="ml-auto flex shrink-0 items-start gap-0.5">
								{#each [['up', 'arrowUp', i === 0], ['down', 'arrowDown', i === sections.length - 1]] as const as [dir, icon, off] (dir)}
									<form method="POST" action={act('move')} use:enhance={toastEnhance()}>
										<input type="hidden" name="id" value={s.id} />
										<input type="hidden" name="direction" value={dir} />
										<Button size="icon" variant="ghost" type="submit" disabled={off} aria-label="Move {s.title} {dir}" class="size-8"><Icon name={icon} class="size-4" /></Button>
									</form>
								{/each}
								<Button size="icon" variant="ghost" class="size-8" aria-label="Edit {s.title}" href={href({ edit: s.id, new: null, delete: null })} onclick={openInPlace(() => ((editing = s.id), (adding = false), (deleting = null)))}
									><Icon name="pencil" class="size-4" /></Button
								>
								<Button
									size="icon"
									variant="ghost"
									class="size-8 hover:text-danger"
									aria-label="Delete {s.title}"
									href={href({ delete: s.id, edit: null, new: null })}
									onclick={openInPlace(() => ((deleting = s.id), (editing = null), (adding = false)))}><Icon name="x" class="size-4" /></Button
								>
							</div>
						{/if}
					</div>
					{#if canEdit && deleting === s.id}
						<!-- inline confirm: a link + real form, so it also asks before deleting without JS -->
						<form
							method="POST"
							action={act('delete')}
							use:enhance={toastEnhance({ onSuccess: () => (deleting = null) })}
							class="flex flex-wrap items-center justify-end gap-2 border-t border-danger/30 bg-danger/5 px-4 py-3"
							data-testid="confirm-delete"
						>
							<input type="hidden" name="id" value={s.id} />
							<p class="mr-auto text-sm">Delete “{s.title}”? People who already signed keep their signed copy.</p>
							<Button variant="ghost" size="sm" href={href({ delete: null })} onclick={openInPlace(() => (deleting = null))}>Cancel</Button>
							<Button variant="danger" size="sm" type="submit">Delete section</Button>
						</form>
					{/if}
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
				action={act('add')}
				use:enhance={toastEnhance({ reset: true, pending: (on) => (busy = on), onSuccess: () => (adding = false) })}
				class="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4"
			>
				<input type="hidden" name="audience" value={audience} />
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_16rem]">
					<Input label="Heading" name="title" required placeholder="e.g. Assumption of risk" />
					<Select label="Type" name="type" bind:value={newType} options={typeOptions} />
				</div>
				<div class="flex flex-col gap-1.5">
					<label for="new-{audience}" class="text-sm font-medium">Content{newType === 'signature' ? ' (optional)' : ''}</label>
					<textarea id="new-{audience}" name="content" rows="5" class={textarea} required={newType !== 'signature'} placeholder="The clause text shown to the signer"></textarea>
				</div>
				<div class="flex justify-end gap-2">
					<Button variant="ghost" size="sm" href={href({ new: null })} onclick={openInPlace(() => (adding = false))}>Cancel</Button>
					<Button size="sm" type="submit" loading={busy}>Add section</Button>
				</div>
			</form>
		{:else}
			<Button
				variant="secondary"
				href={href({ new: '1', edit: null, delete: null })}
				onclick={openInPlace(() => ((adding = true), (editing = null), (deleting = null)))}
				class="self-start"
				data-testid="add-section-{audience}"><Icon name="plus" class="size-4" /> Add section</Button
			>
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
