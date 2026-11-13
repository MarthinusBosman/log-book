<script lang="ts">
	import { enhance } from '$app/forms';
	import { Avatar, Badge, Button, Icon } from '#lib/ui/index.ts';
	import StaffToday from '#lib/components/manifest/StaffToday.svelte';
	import JumperDashboard from '#lib/components/jumper/JumperDashboard.svelte';
	import SetupChecklist from '#lib/components/staffadmin/SetupChecklist.svelte';
	import { openToday } from '#lib/components/jumper/hours.ts';
	import { ROLE_LABELS } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const firstName = $derived(data.user.name.split(' ')[0]);
	// From the server clock in the DZ's timezone, so SSR and hydration agree. Without a dropzone
	// we don't know the jumper's timezone (UTC would say "afternoon" at 19:00 in Johannesburg).
	const hour = $derived(
		data.hours
			? Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: data.hours.timezone }).format(data.serverNow))
			: null
	);
	const greeting = $derived(hour === null ? 'Welcome' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
	// Loads on the board beat the configured opening days (boogies, weather days, special openings).
	const open = $derived(
		data.staffToday?.loadsPlanned ? { label: 'Loads running today', tone: 'success' as const } : data.hours ? openToday(data.hours, data.serverNow) : null
	);
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
	<div>
		<p class="text-sm text-muted">{greeting},</p>
		<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="dashboard-heading">
			{firstName} <span class="text-subtle">· Dashboard</span>
		</h1>
	</div>
	{#if data.current}
		<div class="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
			{#if open}<Badge tone={open.tone} dot>{open.label}</Badge>{/if}
			<Badge tone="brand">{ROLE_LABELS[data.current.role]}</Badge>
		</div>
	{/if}
</div>

{#if !data.current}
	<div class="mt-6 flex flex-col gap-3 rounded-2xl border border-dashed border-border-strong p-4 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted">
			You’re not part of a dropzone yet. Follow one to check in and manifest — your logbook works either way.
		</p>
		<div class="flex shrink-0 flex-wrap gap-2">
			<Button href="/app/dropzones" size="sm"><Icon name="globe" class="size-4" /> Find a dropzone</Button>
			<Button href="/app/dropzones/new" size="sm" variant="secondary"><Icon name="plus" class="size-4" /> Create one</Button>
		</div>
	</div>
{/if}

{#if data.photoPrompt}
	<div class="mt-6 flex items-center gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4" data-testid="photo-prompt">
		<Avatar name={data.user.name} size="lg" class="hidden sm:grid" />
		<div class="min-w-0 flex-1">
			<p class="font-medium">Add a profile photo</p>
			<p class="text-sm text-muted">Manifest, instructors and your team see it on loads and team lists, so they recognise you at the hangar.</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<Button href="/app/profile" size="sm" data-testid="photo-prompt-add"><Icon name="user" class="size-4" /> Add photo</Button>
				<form method="POST" action="?/dismissPhotoPrompt" use:enhance>
					<Button type="submit" size="sm" variant="ghost" data-testid="photo-prompt-dismiss">Not now</Button>
				</form>
			</div>
		</div>
	</div>
{/if}

{#if data.setup && data.current}
	<SetupChecklist class="mt-6" steps={data.setup} dropzoneName={data.current.dropzone.name} />
{/if}

{#if data.staffToday}
	<StaffToday class="mt-8" today={data.staffToday} timezone={data.staffTz} serverNow={data.serverNow} />
{/if}

<div class="mt-6 lg:mt-8">
	{#if data.isStaff}<h2 class="mb-4 text-lg font-semibold tracking-tight">My jumping</h2>{/if}
	<JumperDashboard data={data.jumper} member={!!data.current} />
</div>
