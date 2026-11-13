<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Input, cn } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import Textarea from '#lib/components/jumper/Textarea.svelte';
	import {
		FEEDBACK_MAX_CHARS,
		FEEDBACK_MIN_CHARS,
		FEEDBACK_PUBLIC_NOTICE,
		FEEDBACK_TYPES,
		FEEDBACK_TYPE_LABELS
	} from '#lib/feedback.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);

	const values = $derived(form?.values);
	const selectedType = $derived(values?.type || data.type || 'bug');
	const includePage = $derived(values ? values.includePage : true);
	const back = $derived(data.from ?? '/app');
</script>

<svelte:head><title>Feedback</title></svelte:head>

<PageHeader title="Feedback" icon="message" description="Report a bug or suggest an idea." />

<div class="max-w-2xl space-y-6" data-testid="feedback">
	{#if data.sent}
		<div class="space-y-4">
			<FormAlert tone="success" message="Thanks — posted as issue #{data.sent.number}." />
			{#if data.scrubbed}
				<p class="text-sm text-muted" data-testid="feedback-scrubbed">
					We removed an email address or phone number from your message before posting it.
				</p>
			{/if}
			<p class="text-sm">
				<a href={data.sent.url} class="text-primary hover:underline" rel="noopener noreferrer" target="_blank" data-testid="feedback-issue-link"
					>View issue #{data.sent.number} on GitHub</a
				>
			</p>
			<div class="flex flex-wrap gap-2">
				<Button href="/app" variant="secondary">Back to the app</Button>
				<Button href="/app/feedback" variant="ghost">Send more feedback</Button>
			</div>
		</div>
	{:else}
		<div class="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm" role="note" data-testid="feedback-notice">
			<p class="font-medium">{FEEDBACK_PUBLIC_NOTICE}</p>
			<p class="mt-1 text-muted">
				Email addresses and phone numbers are removed automatically. Your name and email are never included; the issue
				only carries an anonymous reference.
			</p>
		</div>

		<Card>
			<form
				method="POST"
				class="space-y-5"
				data-testid="feedback-form"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						pending = false;
						await update({ reset: false });
					};
				}}
			>
				<fieldset class="min-w-0">
					<legend class="mb-2 text-sm font-medium">What is it?</legend>
					<div class="grid grid-cols-3 gap-2">
						{#each FEEDBACK_TYPES as t (t)}
							<label
								class={cn(
									'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium',
									'has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/15'
								)}
							>
								<input type="radio" name="type" value={t} checked={selectedType === t} required class="accent-[var(--color-primary)]" />
								{FEEDBACK_TYPE_LABELS[t]}
							</label>
						{/each}
					</div>
				</fieldset>

				<Textarea
					label="Message"
					name="message"
					rows={7}
					required
					minlength={FEEDBACK_MIN_CHARS}
					maxlength={FEEDBACK_MAX_CHARS}
					value={values?.message ?? ''}
					placeholder="What happened, or what would make this better?"
					hint="{FEEDBACK_MIN_CHARS}–{FEEDBACK_MAX_CHARS} characters."
				/>

				<input type="hidden" name="from" value={data.from ?? ''} />
				{#if data.from}
					<label class="flex items-start gap-3 text-sm">
						<input type="checkbox" name="include_page" checked={includePage} class="mt-0.5 size-4 accent-[var(--color-primary)]" />
						<span>Include the page I was on <span class="break-all text-muted">({data.from})</span></span>
					</label>
				{/if}

				<FormAlert message={form?.message ?? null} />

				<div class="flex flex-wrap justify-end gap-2">
					<Button href={back} variant="ghost">Cancel</Button>
					<Button type="submit" loading={pending}>Post feedback</Button>
				</div>
			</form>
		</Card>
	{/if}

	{#if data.admin}
		<Card title="Find a reporter" description="Super admins only: the account behind an issue's anonymous reporter reference." data-testid="reporter-lookup">
			<form method="GET" class="flex flex-wrap items-end gap-2">
				<Input label="Reporter reference" name="ref" value={data.admin.ref} placeholder="12 hex characters" class="min-w-0 flex-1" autocomplete="off" />
				<Button type="submit" variant="secondary">Look up</Button>
			</form>
			{#if data.admin.ref}
				{#if data.admin.match}
					{@const m = data.admin.match}
					<div class="mt-4 text-sm" data-testid="reporter-match">
						<p class="font-medium">{m.name}{m.deleted ? ' (deleted account)' : ''}</p>
						<p class="text-muted">{m.email}</p>
						{#if m.issues.length}
							<ul class="mt-2 space-y-0.5">
								{#each m.issues as i (i.number)}
									<li><a href={i.url} class="text-primary hover:underline" rel="noopener noreferrer" target="_blank">#{i.number}</a></li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else}
					<p class="mt-4 text-sm text-muted">No submission with that reference (the account may have been deleted).</p>
				{/if}
			{/if}
		</Card>
	{/if}
</div>
