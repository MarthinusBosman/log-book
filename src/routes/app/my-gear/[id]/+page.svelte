<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import { Badge, Button, Card, Input, Select, toast } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import RigForm from '#lib/components/jumper/RigForm.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { DUE_TONES, dueLabel, fmtDate } from '#lib/components/jumper/format.ts';
	import type { RigFormEcho } from '#lib/server/jumper/gear.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const rig = $derived(data.rig);
	const f = $derived(form as { action?: string; message?: string; success?: string; values?: RigFormEcho } | null);
	let kind = $state('reserve_repack');
	let busy = $state(false);
	const KIND_LABELS: Record<string, string> = { reserve_repack: 'Reserve repack', aad_service: 'AAD service', main_reline: 'Main reline', inspection: 'Inspection', other: 'Other' };
	const today = $derived(data.ctx.today);

	onMount(() => {
		if (data.added) {
			toast.success('Gear added successfully');
			history.replaceState(history.state, '', location.pathname);
		}
	});
	$effect(() => {
		const msg = f?.success;
		if (msg) untrack(() => toast.success(msg));
	});
</script>

<svelte:head><title>{rig.title}</title></svelte:head>

<PageHeader title={rig.title} description={rig.container ?? undefined} back={{ href: '/app/my-gear', label: 'My gear' }}>
	{#snippet actions()}
		{#if !rig.active}<Badge>Retired</Badge>{/if}
		<Badge tone={DUE_TONES[rig.repack.status]}>Reserve · {dueLabel(rig.repack, { ok: 'OK' })}</Badge>
		{#if rig.aadDue.status !== 'unknown'}<Badge tone={DUE_TONES[rig.aadDue.status]}>AAD · {dueLabel(rig.aadDue, { ok: 'OK' })}</Badge>{/if}
	{/snippet}
</PageHeader>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
	<div class="lg:col-span-3">
		<Card title="Rig details">
			<RigForm values={(f?.action === 'update' && f.values) || rig} exitWeightKg={data.ctx.exitWeightKg} intervalDays={data.ctx.intervalDays} {today} action="?/update" submitLabel="Save changes" error={f?.action === 'update' ? f.message : null} />
		</Card>
	</div>
	<aside class="space-y-4 lg:col-span-2">
		<Card title="Record service" description="Repacks move your due date forward.">
			<form method="POST" action="?/service" class="space-y-3" use:enhance={() => { busy = true; return async ({ update }) => { await update(); busy = false; }; }} data-testid="service-form">
				<Select label="What was done" name="kind" bind:value={kind} options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
				<div class="grid grid-cols-2 gap-3">
					<Input label="Date" name="performedOn" type="date" value={today} min="1900-01-01" max={today} required />
					{#if kind === 'aad_service'}<Input label="Next service due" name="nextDueOn" type="date" min={today} />{/if}
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Input label="Rigger" name="performedByName" placeholder="Name" />
					<Input label="Rigger #" name="riggerNumber" />
				</div>
				<Input label="Notes" name="notes" />
				<FormAlert message={f?.action === 'service' ? f.message : null} />
				<Button type="submit" class="w-full" loading={busy}>Record</Button>
			</form>
		</Card>

		<Card title="Service history" padded={false}>
			{#if data.history.length}
				<ol class="divide-y divide-border">
					{#each data.history as h (h.id)}
						<li class="flex items-start gap-3 px-5 py-3 text-sm">
							<JIcon name="history" class="mt-0.5 size-4 text-muted" />
							<div class="min-w-0 flex-1">
								<p class="flex justify-between gap-2"><span class="font-medium">{KIND_LABELS[h.kind] ?? h.kind}</span><span class="shrink-0 text-muted tabular-nums">{fmtDate(h.performedOn)}</span></p>
								{#if h.by || h.riggerNumber}<p class="text-muted">{h.by ?? ''}{h.riggerNumber ? ` · #${h.riggerNumber}` : ''}</p>{/if}
								{#if h.notes}<p class="text-muted">{h.notes}</p>{/if}
							</div>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="px-5 py-4 text-sm text-muted">No service recorded yet.</p>
			{/if}
		</Card>

		<Card>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<form method="POST" action="?/retire" use:enhance>
					<Button type="submit" variant="secondary" size="sm">{rig.active ? 'Retire rig' : 'Put back in service'}</Button>
				</form>
				<form method="POST" action="?/delete" use:enhance={(e) => { if (!confirm('Delete this rig and its service history?')) e.cancel(); }}>
					<Button type="submit" variant="ghost" size="sm" class="text-danger hover:text-danger"><JIcon name="trash" class="size-4" /> Delete</Button>
				</form>
			</div>
		</Card>
	</aside>
</div>
