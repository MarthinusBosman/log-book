<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, EmptyState, cn, toast } from '#lib/ui/index.ts';
	import type { IconName } from '#lib/ui/Icon.svelte';
	import { Icon } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { relativeTime } from '#lib/components/jumper/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const unread = $derived(data.notifications.filter((n) => !n.read).length);
	const now = Date.now();

	const ICONS: Record<string, IconName> = {
		call_20min: 'plane',
		gear_up: 'plane',
		added_to_load: 'plane',
		removed_from_load: 'plane',
		moved_load: 'plane',
		new_loads: 'calendar',
		load_completed: 'book',
		jump_signed: 'book',
		repack_due: 'parachute',
		payment_notice: 'wallet',
		checked_out: 'checkin',
		team_add: 'team',
		friend_add: 'team',
		added_staff: 'staff',
		checked_in: 'checkin'
	};
</script>

<svelte:head><title>Notifications</title></svelte:head>

<PageHeader title="Notifications" description={unread ? `${unread} unread` : 'You’re all caught up'}>
	{#snippet actions()}
		<div class="inline-flex rounded-xl border border-border bg-surface-2/60 p-1 text-sm">
			<a href="/app/notifications" class={cn('rounded-lg px-3 py-1.5 font-medium', !data.unreadOnly ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>All</a>
			<a href="?filter=unread" class={cn('rounded-lg px-3 py-1.5 font-medium', data.unreadOnly ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>Unread</a>
		</div>
		{#if unread}
			<form method="POST" action="?/readAll" use:enhance={() => async ({ update }) => { await update(); toast.success('All caught up'); }}>
				<Button type="submit" variant="secondary" size="sm" data-testid="mark-all-read"><Icon name="check" class="size-4" /> Mark all read</Button>
			</form>
		{/if}
	{/snippet}
</PageHeader>

{#if data.notifications.length === 0}
	<EmptyState title="You have no notifications" description="Load calls, manifest changes, sign-offs and wallet updates will show up here.">
		{#snippet icon()}<JIcon name="bell" class="size-6" />{/snippet}
	</EmptyState>
{:else}
	<ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface" data-testid="notification-list">
		{#each data.notifications as n (n.id)}
			<li class={cn('group relative flex items-start gap-3 px-4 py-4 sm:px-5', !n.read && 'bg-primary/[0.04]')}>
				<span class={cn('mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl', n.read ? 'bg-surface-2 text-muted' : 'bg-primary/10 text-primary')}>
					<Icon name={ICONS[n.type] ?? 'zap'} class="size-5" />
				</span>
				<form method="POST" action="?/open" class="min-w-0 flex-1">
					<input type="hidden" name="id" value={n.id} />
					<input type="hidden" name="href" value={n.href ?? ''} />
					<button type="submit" class="block w-full text-left">
						<span class="flex items-baseline justify-between gap-3">
							<span class={cn('truncate text-sm', n.read ? 'font-medium text-fg' : 'font-semibold text-fg')}>{n.title}</span>
							<time class="shrink-0 text-xs text-subtle">{relativeTime(n.createdAt, now)}</time>
						</span>
						<span class="mt-0.5 block text-sm text-muted">{n.body}</span>
					</button>
				</form>
				{#if !n.read}
					<form method="POST" action="?/read" use:enhance class="shrink-0">
						<input type="hidden" name="id" value={n.id} />
						<button type="submit" class="grid size-8 place-items-center rounded-lg text-primary hover:bg-surface-2" aria-label="Mark as read" title="Mark as read" data-testid="mark-read">
							<span class="size-2.5 rounded-full bg-primary"></span>
						</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
