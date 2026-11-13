<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { brand } from '#lib/brand.ts';
	import Logo from '#lib/components/Logo.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import DropzoneSwitcher from '#lib/components/DropzoneSwitcher.svelte';
	import NotificationBell from '#lib/components/jumper/NotificationBell.svelte';
	import { jumperNav, mobileTabs, visibleStaffNav, type NavItem } from '#lib/nav.ts';
	import { Avatar, Badge, Dialog, Icon, cn } from '#lib/ui/index.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let mobileNav = $state(false);

	afterNavigate(() => (mobileNav = false));

	const href = (item: NavItem) => (item.slug ? `/app/${item.slug}` : '/app');
	const isActive = (item: NavItem) =>
		item.slug ? page.url.pathname.startsWith(`/app/${item.slug}`) : page.url.pathname === '/app';

	const staffItems = $derived(visibleStaffNav(data.caps));
	const tabs = $derived(mobileTabs(data.caps));
	/** Highlight "More" when the current page isn't one of the tabs. */
	const onTab = $derived(tabs.some(isActive));
	/** Feedback remembers the page it was opened from (kept when already on the feedback page). */
	const feedbackHref = $derived.by(() => {
		const from = page.url.pathname === '/app/feedback' ? page.url.searchParams.get('from') : page.url.pathname;
		return from ? `/app/feedback?from=${encodeURIComponent(from)}` : '/app/feedback';
	});
</script>

{#snippet navLink(item: NavItem)}
	{@const active = isActive(item)}
	<a
		href={href(item)}
		aria-current={active ? 'page' : undefined}
		class={cn(
			'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
			active ? 'bg-primary/10 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
		)}
	>
		{#if active}<span class="absolute inset-y-1.5 -left-3 w-0.5 rounded-full bg-primary"></span>{/if}
		<Icon
			name={item.icon}
			class={cn('size-[18px] transition-colors', active ? 'text-primary' : 'text-subtle group-hover:text-muted')}
		/>
		{item.label}
	</a>
{/snippet}

<svelte:head>{@html data.branding?.style ?? ''}</svelte:head>

{#snippet sidebar()}
	<div class="flex h-full flex-col">
		<div class="flex items-center justify-between px-4 pt-5 pb-4">
			<a href="/app" class="min-w-0">
				{#if data.branding?.logoUrl}
					<span class="flex min-w-0 items-center gap-2.5" data-testid="dz-logo">
						<img src={data.branding.logoUrl} alt="{data.current?.dropzone.name ?? ''} logo" class="h-9 max-w-32 shrink-0 object-contain" />
						<span class="sr-only">{brand.name}</span>
					</span>
				{:else}
					<Logo />
				{/if}
			</a>
			<div class="flex items-center gap-1">
				<NotificationBell count={data.unread} />
				<ThemeToggle />
			</div>
		</div>
		<div class="px-3">
			<DropzoneSwitcher memberships={data.memberships} current={data.current} />
		</div>
		<nav class="scrollbar-thin mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main">
			{#if staffItems.length > 1}
				<div>
					<p class="px-2.5 pb-1.5 text-[11px] font-medium tracking-wider text-subtle uppercase">Dropzone</p>
					<div class="space-y-0.5">
						{#each staffItems as item (item.slug)}{@render navLink(item)}{/each}
					</div>
				</div>
			{:else}
				<div class="space-y-0.5">{@render navLink(staffItems[0])}</div>
			{/if}
			<div>
				<p class="px-2.5 pb-1.5 text-[11px] font-medium tracking-wider text-subtle uppercase">My jumping</p>
				<div class="space-y-0.5">
					{#each jumperNav as item (item.slug)}{@render navLink(item)}{/each}
				</div>
			</div>
		</nav>
		<div class="border-t border-border p-3">
			{#if data.feedbackEnabled}
				<a
					href={feedbackHref}
					aria-current={page.url.pathname === '/app/feedback' ? 'page' : undefined}
					class="group mb-1 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg aria-[current=page]:text-fg"
					data-testid="feedback-link"
				>
					<Icon name="message" class="size-[18px] text-subtle group-hover:text-muted" />
					Feedback
				</a>
			{/if}
			<div class="flex items-center gap-3 rounded-xl p-2">
				<Avatar name={data.user.name} src={data.user.avatar} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium" data-testid="user-name">{data.user.name}</p>
					<p class="truncate text-xs text-muted">{data.user.email}</p>
				</div>
				<form method="POST" action="/logout">
					<button
						type="submit"
						class="grid size-9 place-items-center rounded-lg text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
						aria-label="Log out"
						title="Log out"
					>
						<Icon name="logout" class="size-[18px]" />
					</button>
				</form>
			</div>
			{#if data.instanceMode === 'dropzone'}
				<p class="px-2 pt-1 text-[11px] text-subtle">
					<Badge tone="neutral" class="!px-1.5 !py-0 !text-[10px]">Self-hosted</Badge>
				</p>
			{/if}
		</div>
	</div>
{/snippet}

<div class="min-h-dvh lg:pl-64">
	<!-- Desktop sidebar -->
	<aside aria-label="App menu" class="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface/70 backdrop-blur-xl lg:block">
		{@render sidebar()}
	</aside>

	<!-- Mobile top bar -->
	<header
		class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur-xl lg:hidden"
	>
		<a href="/app" class="-ml-1 grid h-10 min-w-10 place-items-center" aria-label="Dashboard">
			{#if data.branding?.logoUrl}<img src={data.branding.logoUrl} alt="" class="h-8 max-w-20 object-contain" />{:else}<Logo showName={false} />{/if}
		</a>
		<!-- the dropzone switcher lives in the menu -->
		<button
			type="button"
			class="flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold hover:bg-surface-2"
			aria-haspopup="dialog"
			aria-label="Open menu · {data.current?.dropzone.name ?? 'no dropzone'}"
			onclick={() => (mobileNav = true)}
		>
			<span class="truncate">{data.current?.dropzone.name ?? brand.name}</span>
			<Icon name="chevronsUpDown" class="size-4 shrink-0 text-subtle" />
		</button>
		<div class="-mr-2 flex items-center gap-1">
			<NotificationBell count={data.unread} />
			<a href="/app/profile" class="grid size-10 place-items-center" aria-label="Profile"><Avatar name={data.user.name} src={data.user.avatar} size="sm" /></a>
		</div>
	</header>

	<Dialog bind:open={mobileNav} variant="left" class="!p-0">
		{@render sidebar()}
	</Dialog>

	<main class="mx-auto w-full max-w-7xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
		{@render children()}
	</main>

	<!-- Mobile bottom tabs: the four most-used destinations for this role + the full menu -->
	<nav
		class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
		aria-label="Quick"
	>
		{#each tabs as item (item.slug)}
			{@const active = isActive(item)}
			<a
				href={href(item)}
				aria-current={active ? 'page' : undefined}
				class={cn(
					'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
					active ? 'text-primary' : 'text-subtle hover:text-fg'
				)}
			>
				<Icon name={item.icon} class="size-5" />
				{item.short ?? item.label}
			</a>
		{/each}
		<button
			type="button"
			class={cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors', !onTab ? 'text-primary' : 'text-subtle hover:text-fg')}
			aria-haspopup="dialog"
			onclick={() => (mobileNav = true)}
		>
			<Icon name="menu" class="size-5" />
			More
		</button>
	</nav>
</div>
