<script lang="ts">
	import { page } from '$app/state';
	import { Icon } from '#lib/ui/index.ts';

	// Works without JS (POST /theme → cookie → redirect back). The marketing layout's inline
	// script intercepts the submit and flips the theme in place when JS is available.
</script>

<form method="POST" action="/theme" data-theme-switch>
	<input type="hidden" name="redirect" value={page.url.pathname} />
	<button
		type="submit"
		class="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
		aria-label="Toggle light and dark theme"
		title="Toggle theme"
	>
		<Icon name="sun" class="hidden size-[18px] dark:block" />
		<Icon name="moon" class="size-[18px] dark:hidden" />
	</button>
</form>
