<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from '#lib/ui/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let submitting = $state(false);
	const title = $derived(data.firstPassword ? 'Set your password' : 'Choose a new password');
</script>

<svelte:head><title>{title}</title></svelte:head>

<h1 class="text-3xl font-semibold tracking-tight">{title}</h1>
{#if data.valid}
	<p class="mt-2 text-muted">
		{#if data.firstPassword}
			You'll sign in with <span class="font-medium text-fg">{data.email}</span>.
		{:else}
			You'll be signed out of all other devices.
		{/if}
	</p>
{/if}

{#if !data.token}
	<p class="mt-8 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
		This reset link is missing its token. <a href="/forgot-password" class="underline">Request a new one</a>.
	</p>
{:else if !data.valid}
	<p class="mt-8 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" data-testid="link-expired">
		This link has expired or was already used. <a href="/forgot-password" class="underline">Get a new link</a> with your
		email address, or <a href="/login" class="underline">log in</a> if you already set a password.
	</p>
{:else}
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
		<input type="hidden" name="token" value={data.token} />
		<!-- Lets password managers save the new password against the right account. -->
		<input type="email" name="username" value={data.email} autocomplete="username" class="hidden" tabindex="-1" aria-hidden="true" readonly />
		{#if data.firstPassword}
			<Input
				label="Your name"
				name="name"
				autocomplete="name"
				maxlength={120}
				required
				value={form?.name ?? data.name}
				error={form?.field === 'name' ? form.message : undefined}
				hint="Shown to the dropzone staff and on your logbook."
			/>
		{/if}
		<Input
			label={data.firstPassword ? 'Password' : 'New password'}
			name="password"
			type="password"
			autocomplete="new-password"
			minlength={8}
			required
			hint="At least 8 characters."
		/>
		{#if form?.message && form.field !== 'name'}
			<p class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
				{form.message}
			</p>
		{/if}
		<Button type="submit" size="lg" loading={submitting} class="mt-2 w-full">
			{data.firstPassword ? 'Set password and sign in' : 'Update password'}
		</Button>
	</form>
{/if}
