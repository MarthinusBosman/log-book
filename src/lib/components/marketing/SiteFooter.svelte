<script lang="ts">
	import Logo from '#lib/components/Logo.svelte';
	import { brand } from '#lib/brand.ts';

	const year = new Date().getFullYear();
	const columns = [
		{
			title: 'Product',
			links: [
				{ href: '/#dropzones', label: 'For dropzones' },
				{ href: '/#jumpers', label: 'For jumpers' },
				{ href: '/features', label: 'All features' },
				{ href: '/#pricing', label: 'Pricing' }
			]
		},
		{
			title: 'Run it',
			links: [
				{ href: '/self-host', label: 'Self-host guide' },
				{ href: '/#import', label: 'Import from Jump Master' },
				{ href: '/#faq', label: 'FAQ' }
			]
		},
		{
			title: 'Account',
			links: [
				{ href: '/signup', label: 'Create account' },
				{ href: '/login', label: 'Log in' },
				{ href: `mailto:${brand.supportEmail}`, label: 'Contact' },
				{ href: '/privacy', label: 'Privacy policy' },
				{ href: '/terms', label: 'Terms of use' }
			]
		}
	];
</script>

<footer class="border-t border-border">
	<div class="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
		<div>
			<Logo />
			<p class="mt-4 max-w-xs text-sm leading-relaxed text-muted">{brand.tagline}</p>
		</div>
		{#each columns as col (col.title)}
			<div>
				<h2 class="text-sm font-medium">{col.title}</h2>
				<ul class="mt-4 space-y-3 text-sm">
					{#each col.links as l (l.href)}
						<li><a href={l.href} class="text-muted transition-colors hover:text-fg">{l.label}</a></li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
	<div class="border-t border-border">
		<div
			class="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8"
		>
			<p>
				© {year} {brand.name}. Built in {brand.madeIn}. Free software under the
				<a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener" class="underline underline-offset-2 hover:text-fg">{brand.license}</a>
				licence ·
				<a href={brand.sourceUrl} rel="noopener" class="underline underline-offset-2 hover:text-fg">Source code</a>
				·
				<a href="/privacy" class="underline underline-offset-2 hover:text-fg">Privacy</a>
				·
				<a href="/terms" class="underline underline-offset-2 hover:text-fg">Terms</a>
			</p>
			<p class="font-mono tracking-wide">Blue skies.</p>
		</div>
	</div>
</footer>
