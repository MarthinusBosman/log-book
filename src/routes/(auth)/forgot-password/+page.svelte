<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from '#lib/ui/index.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Reset password</title></svelte:head>

<h1 class="text-3xl font-semibold tracking-tight">Reset your password</h1>
<p class="mt-2 text-muted">We'll email you a link to choose a new one.</p>

{#if form && 'sent' in form}
	<p class="mt-8 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
		If an account exists for <strong>{form.email}</strong>, a reset link is on its way. It's valid for one
		hour.
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
		<Input
			label="Email"
			name="email"
			type="email"
			autocomplete="email"
			required
			value={form?.email ?? ''}
			error={form && 'message' in form ? form.message : null}
		/>
		<Button type="submit" size="lg" loading={submitting} class="mt-2 w-full">Send reset link</Button>
	</form>
{/if}

<p class="mt-8 text-center text-sm text-muted">
	<a href="/login" class="font-medium text-primary hover:underline">Back to log in</a>
</p>
