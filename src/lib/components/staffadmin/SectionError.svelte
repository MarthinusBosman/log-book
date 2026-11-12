<script lang="ts">
	import { page } from '$app/state';
	import { Button, EmptyState, Icon } from '#lib/ui/index.ts';
</script>

<svelte:head><title>{page.status === 403 ? 'No access' : page.status === 404 ? 'Not found' : 'Error'}</title></svelte:head>

<EmptyState
	class="mt-4"
	level={1}
	title={page.status === 403 ? 'No access' : page.status === 404 ? 'Off the landing area' : 'Something went wrong'}
	description={!page.error?.message || /^not found$/i.test(page.error.message) ? (page.status === 404 ? 'This page doesn’t exist. Check the link or head back.' : 'Please try again.') : page.error.message}
>
	{#snippet icon()}<Icon name={page.status === 403 ? 'shield' : 'parachute'} class="size-6" />{/snippet}
	{#snippet action()}<Button href="/app" variant="secondary">Back to dashboard</Button>{/snippet}
</EmptyState>
