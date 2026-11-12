<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button, Input } from '#lib/ui/index.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let submitting = $state(false);
	const redirectTo = $derived(page.url.searchParams.get('redirectTo'));
	const reset = $derived(page.url.searchParams.get('reset') === '1');
</script>

<svelte:head><title>Log in</title></svelte:head>

<h1 class="text-3xl font-semibold tracking-tight">Welcome back</h1>
<p class="mt-2 text-muted">Log in to manifest, check in, or update your logbook.</p>

{#if reset}
	<p class="mt-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
		Password updated — log in with your new password.
	</p>
{/if}

<form
	method="POST"
	class="mt-8 flex flex-col gap-4"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update({ reset: false });
			submitting = false;
		};
	}}
>
	<Input
		label="Email"
		name="email"
		type="email"
		autocomplete="email"
		inputmode="email"
		required
		value={form?.email ?? ''}
	/>
	<div class="flex flex-col gap-1.5">
		<Input label="Password" name="password" type="password" autocomplete="current-password" required />
		<a href="/forgot-password" class="self-end text-sm text-primary hover:underline">Forgot password?</a>
	</div>

	{#if form?.message}
		<p class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
			{form.message}
		</p>
	{/if}

	<Button type="submit" size="lg" loading={submitting} class="mt-2 w-full">Log in</Button>
</form>

<p class="mt-8 text-center text-sm text-muted">
	New here?
	<a
		href={redirectTo ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : '/signup'}
		class="font-medium text-primary hover:underline">Create an account</a
	>
</p>
