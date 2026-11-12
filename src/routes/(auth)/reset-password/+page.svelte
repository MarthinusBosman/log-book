<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from '#lib/ui/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Choose a new password</title></svelte:head>

<h1 class="text-3xl font-semibold tracking-tight">Choose a new password</h1>
<p class="mt-2 text-muted">You'll be signed out of all other devices.</p>

{#if !data.token}
	<p class="mt-8 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
		This reset link is missing its token. <a href="/forgot-password" class="underline">Request a new one</a>.
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
		<Input
			label="New password"
			name="password"
			type="password"
			autocomplete="new-password"
			minlength={8}
			required
			hint="At least 8 characters."
		/>
		{#if form?.message}
			<p class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
				{form.message}
			</p>
		{/if}
		<Button type="submit" size="lg" loading={submitting} class="mt-2 w-full">Update password</Button>
	</form>
{/if}
