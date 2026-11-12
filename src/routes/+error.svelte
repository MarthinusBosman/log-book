<script lang="ts">
	import { page } from '$app/state';
	import Logo from '#lib/components/Logo.svelte';
	import { Button } from '#lib/ui/index.ts';
</script>

<svelte:head><title>{page.status}</title></svelte:head>

<div class="bg-chart grid min-h-dvh place-items-center px-6">
	<div class="text-center">
		<a href="/" class="inline-block"><Logo /></a>
		<p class="mt-10 font-mono text-7xl font-semibold tracking-tight text-primary">{page.status}</p>
		<h1 class="mt-3 text-xl font-semibold">
			{page.status === 404 ? 'Off the landing area' : 'Something went wrong'}
		</h1>
		<p class="mt-2 text-muted">{page.error?.message}</p>
		<Button href="/" variant="secondary" class="mt-8">Back to safety</Button>
	</div>
</div>
