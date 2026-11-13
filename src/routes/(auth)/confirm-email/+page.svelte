<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/ui/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Confirm your new email</title></svelte:head>

<h1 class="text-3xl font-semibold tracking-tight">{form?.done ? 'Email changed' : 'Confirm your new email'}</h1>

{#if form?.done}
	<p class="mt-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm" role="status" data-testid="email-confirmed">
		Done: you now sign in with <span class="font-medium wrap-anywhere">{form.newEmail}</span>.
	</p>
	<Button href={data.signedIn ? '/app/profile?tab=security' : '/login'} size="lg" class="mt-6 w-full">{data.signedIn ? 'Back to your profile' : 'Sign in'}</Button>
{:else if !data.newEmail}
	<p class="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert" data-testid="email-link-invalid">
		This confirmation link is invalid or has expired. Ask for a new one under Profile → Security.
	</p>
	<Button href={data.signedIn ? '/app/profile?tab=security' : '/login'} variant="outline" class="mt-6 w-full">{data.signedIn ? 'Go to Security' : 'Sign in'}</Button>
{:else}
	<p class="mt-2 text-muted">Switch your sign-in email to <span class="font-medium wrap-anywhere text-fg">{data.newEmail}</span>?</p>
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
		{#if form?.message}
			<p class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{form.message}</p>
		{/if}
		<Button type="submit" size="lg" loading={submitting} class="w-full" data-testid="confirm-email">Confirm new email</Button>
	</form>
{/if}
