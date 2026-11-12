<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge, Button, EmptyState, Icon, cn } from '#lib/ui/index.ts';
	import FormBuilder from '#lib/components/waivers/FormBuilder.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const tabs = $derived([
		{ id: 'tandem', label: 'Tandem form', count: data.sections.tandem.length },
		{ id: 'sport', label: 'Sport form', count: data.sections.sport.length },
		{ id: 'signed', label: 'Signed' },
		{ id: 'jumpers', label: 'Jumper status' }
	]);
	const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
	const fmtDate = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—');
	const validCount = $derived(data.jumpers.filter((j) => j.valid).length);
	const pdfHref = (id: string) => `/app/waivers/signed/${id}/pdf`;
</script>

<svelte:head><title>Waivers · {data.dz.name}</title></svelte:head>

<div class="flex flex-wrap items-center gap-3">
	<span class="hidden size-10 place-items-center rounded-xl border border-border bg-surface text-primary sm:grid"><Icon name="waiver" /></span>
	<div class="mr-auto">
		<h1 class="text-2xl font-semibold tracking-tight">Waivers</h1>
		<p class="text-sm text-muted">Indemnity forms, signed waivers and who is covered.</p>
	</div>
	<Button variant="secondary" href="/app/waivers/sign/{data.dz.id}"><Icon name="checkin" class="size-4" /> Sign as jumper</Button>
</div>

<nav class="mt-6 scrollbar-none flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface-2/60 p-1 sm:inline-flex" aria-label="Waiver sections">
	{#each tabs as t (t.id)}
		<a
			href="?tab={t.id}"
			aria-current={data.tab === t.id ? 'page' : undefined}
			class={cn(
				'flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
				data.tab === t.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
			)}
		>
			{t.label}
			{#if t.count !== undefined}<span class="rounded-full bg-surface-2 px-1.5 text-xs text-muted tabular-nums">{t.count}</span>{/if}
		</a>
	{/each}
</nav>

<div class="mt-5 max-w-4xl">
	{#if data.tab === 'tandem' || data.tab === 'sport'}
		{#key data.tab}
			<FormBuilder
				audience={data.tab}
				sections={data.sections[data.tab]}
				active={data.tab === 'tandem' ? data.dz.tandemActive : data.dz.sportActive}
				dropzoneName={data.dz.name}
				canEdit={data.canEdit}
			/>
		{/key}
	{:else if data.tab === 'signed'}
		<form method="GET" class="flex flex-col gap-2 sm:flex-row" data-sveltekit-keepfocus>
			<input type="hidden" name="tab" value="signed" />
			<input
				type="search"
				name="q"
				value={data.q}
				placeholder="Search signer name or email"
				aria-label="Search signed waivers"
				class="h-11 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none placeholder:text-subtle focus:border-primary focus:ring-4 focus:ring-primary/15"
			/>
			<select
				name="audience"
				aria-label="Form"
				value={data.audience}
				onchange={(e) => goto(`?tab=signed&q=${encodeURIComponent(data.q)}&audience=${e.currentTarget.value}`)}
				class="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
			>
				<option value="">All forms</option>
				<option value="tandem">Tandem</option>
				<option value="sport">Sport</option>
			</select>
			<Button type="submit" variant="secondary">Search</Button>
		</form>
		{#if data.signed.length}
			<ul class="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
				{#each data.signed as s (s.id)}
					<li class="flex items-center gap-3 px-4 py-3" data-testid="signed-row">
						<span class={cn('grid size-9 shrink-0 place-items-center rounded-xl', s.audience === 'tandem' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success')}>
							<Icon name={s.audience === 'tandem' ? 'tandem' : 'parachute'} class="size-4" />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">
								{s.signerName}
								{#if s.guardianName}<span class="text-sm font-normal text-muted">· guardian {s.guardianName}</span>{/if}
							</p>
							<p class="truncate text-xs text-muted">
								{s.audience === 'tandem' ? 'Tandem' : 'Sport'} · {fmt(s.signedAt)}{s.email ? ` · ${s.email}` : ''}
							</p>
						</div>
						{#if s.tandemPassengerId}
							<Button size="sm" variant="ghost" href="/app/tandems/{s.tandemPassengerId}" class="hidden sm:inline-flex">Booking</Button>
						{/if}
						<Button size="sm" variant="secondary" href={pdfHref(s.id)} target="_blank" rel="noopener" aria-label="Download PDF for {s.signerName}">
							<Icon name="waiver" class="size-4" /> PDF
						</Button>
					</li>
				{/each}
			</ul>
		{:else}
			<EmptyState title="No signed waivers{data.q ? ' match' : ' yet'}" description="Waivers signed online or in the app will appear here with a PDF copy." class="mt-4">
				{#snippet icon()}<Icon name="waiver" class="size-6" />{/snippet}
			</EmptyState>
		{/if}
	{:else}
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<form method="GET" class="flex-1" data-sveltekit-keepfocus>
				<input type="hidden" name="tab" value="jumpers" />
				<input
					type="search"
					name="q"
					value={data.q}
					placeholder="Search members"
					aria-label="Search members"
					class="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none placeholder:text-subtle focus:border-primary focus:ring-4 focus:ring-primary/15"
				/>
			</form>
			<p class="text-sm text-muted"><span class="font-semibold text-fg tabular-nums">{validCount}</span> of {data.jumpers.length} hold a valid sport waiver</p>
		</div>
		{#if !data.dz.sportActive}
			<p class="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
				The sport jumper waiver is switched off, so jumpers aren’t asked to sign. <a href="?tab=sport" class="underline">Set it up</a>.
			</p>
		{/if}
		<ul class="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
			{#each data.jumpers as j (j.userId)}
				<li class="flex items-center gap-3 px-4 py-2.5" data-testid="jumper-row">
					<span class={cn('size-2.5 shrink-0 rounded-full', j.valid ? 'bg-success' : j.signedAt ? 'bg-warning' : 'bg-danger/70')}></span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{j.name}</p>
						<p class="truncate text-xs text-muted">{j.email}</p>
					</div>
					<div class="text-right">
						{#if j.valid}
							<Badge tone="success">Valid</Badge>
							<p class="mt-0.5 text-[11px] text-subtle">until {fmtDate(j.expiresAt)}</p>
						{:else if j.signedAt}
							<Badge tone="warning">Expired</Badge>
							<p class="mt-0.5 text-[11px] text-subtle">{fmtDate(j.expiresAt)}</p>
						{:else}
							<Badge tone="danger">Not signed</Badge>
						{/if}
					</div>
					{#if j.signatureId}
						<Button size="icon" variant="ghost" href={pdfHref(j.signatureId)} target="_blank" rel="noopener" aria-label="Waiver PDF for {j.name}"><Icon name="waiver" class="size-4" /></Button>
					{:else}
						<span class="size-10"></span>
					{/if}
				</li>
			{:else}
				<li class="px-4 py-8 text-center text-sm text-muted">No members found.</li>
			{/each}
		</ul>
	{/if}
</div>
