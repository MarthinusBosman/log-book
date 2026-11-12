<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button, Input } from '#lib/ui/index.ts';
	import { brand } from '#lib/brand.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let submitting = $state(false);
	const redirectTo = $derived(page.url.searchParams.get('redirectTo'));
	const err = (field: string) => (form?.field === field ? form.message : null);
</script>

<svelte:head><title>Create account</title></svelte:head>

<h1 class="text-3xl font-semibold tracking-tight">Create your account</h1>
<p class="mt-2 text-muted">One {brand.name} account for every dropzone you jump at.</p>

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
	<Input label="Full name" name="name" autocomplete="name" required value={form?.name ?? ''} error={err('name')} />
	<Input
		label="Email"
		name="email"
		type="email"
		autocomplete="email"
		inputmode="email"
		required
		value={form?.email ?? ''}
		error={err('email')}
	/>
	<Input
		label="Password"
		name="password"
		type="password"
		autocomplete="new-password"
		minlength={8}
		required
		hint="At least 8 characters."
		error={err('password')}
	/>

	{#if form?.message && !form.field}
		<p class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
			{form.message}
		</p>
	{/if}

	<Button type="submit" size="lg" loading={submitting} class="mt-2 w-full">Create account</Button>
</form>

<p class="mt-8 text-center text-sm text-muted">
	Already have an account?
	<a
		href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
		class="font-medium text-primary hover:underline">Log in</a
	>
</p>
