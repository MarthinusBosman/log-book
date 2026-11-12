<script lang="ts">
	import { Button } from '#lib/ui/index.ts';
</script>

<svelte:head><title>Log out</title></svelte:head>

<h1 class="text-3xl font-semibold tracking-tight">Log out?</h1>
<p class="mt-2 text-muted">You'll need to log in again to manifest or update your logbook.</p>

<form method="POST" class="mt-8 flex gap-3">
	<Button type="submit" size="lg" class="flex-1">Log out</Button>
	<Button href="/app" variant="secondary" size="lg" class="flex-1">Cancel</Button>
</form>
