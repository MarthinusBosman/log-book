<script lang="ts">
	import { Avatar, Button } from '#lib/ui/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import { brand } from '#lib/brand.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const host = $derived(new URL(data.client.origin).host);
</script>

<svelte:head><title>Link {data.client.name}</title></svelte:head>

<div data-testid="consent">
	<div class="flex items-center gap-3">
		<span class="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon name="server" class="size-6" /></span>
		<span class="h-px w-8 bg-border" aria-hidden="true"></span>
		<Avatar name={data.user.name} />
	</div>
	<h1 class="mt-6 text-2xl font-semibold tracking-tight">Link your {brand.name} account</h1>
	<p class="mt-2 text-muted">
		<span class="font-medium text-fg">{data.client.name}</span>
		<span class="text-subtle">({host})</span> runs its own {brand.name} instance and wants to connect to your account
		<span class="font-medium text-fg">{data.user.email}</span>.
	</p>

	<div class="mt-6 rounded-2xl border border-border bg-surface p-4">
		<p class="text-sm font-medium">It will be able to</p>
		<ul class="mt-3 space-y-2.5">
			{#each data.scopes as s (s.id)}
				<li class="flex items-start gap-2.5 text-sm text-muted">
					<Icon name="check" class="mt-0.5 size-4 shrink-0 text-success" />
					{s.label}
				</li>
			{/each}
		</ul>
	</div>
	<p class="mt-3 text-xs text-subtle">You can unlink it any time under Settings → Linked accounts.</p>

	{#if form?.message}
		<p class="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{form.message}</p>
	{/if}

	<form method="POST" action={data.params} class="mt-6 grid grid-cols-2 gap-3">
		<Button type="submit" name="decision" value="deny" variant="secondary" size="lg">Cancel</Button>
		<Button type="submit" name="decision" value="allow" size="lg" data-testid="consent-allow">Allow</Button>
	</form>
</div>
