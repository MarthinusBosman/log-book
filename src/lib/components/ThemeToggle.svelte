<script lang="ts">
	import { page } from '$app/state';
	import { THEME_COLORS, THEME_COOKIE, type PageTheme, type Theme } from '#lib/theme.ts';
	import { Icon, cn } from '#lib/ui/index.ts';

	let { class: className }: { class?: string } = $props();

	const initial = (page.data.theme as PageTheme | undefined) ?? 'dark';
	// "system" (a dropzone default) renders as dark until we can ask the browser.
	let theme = $state<Theme>(initial === 'light' ? 'light' : 'dark');

	function toggle() {
		const root = document.documentElement;
		if (root.classList.contains('system')) {
			// Leave OS-following mode: start from what the visitor currently sees.
			theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
			root.classList.remove('system');
		}
		theme = theme === 'dark' ? 'light' : 'dark';
		root.classList.add('[&_*]:!transition-none');
		root.classList.toggle('dark', theme === 'dark');
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
		document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
		requestAnimationFrame(() => root.classList.remove('[&_*]:!transition-none'));
	}
</script>

<button
	type="button"
	onclick={toggle}
	class={cn(
		'grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg',
		className
	)}
	aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	title="Toggle theme"
>
	<Icon name={theme === 'dark' ? 'sun' : 'moon'} class="size-[18px]" />
</button>
