<script lang="ts">
	/**
	 * Image upload control that works with and without JavaScript.
	 *
	 * - No JS: a visible "Upload/Change …" button (a <label> for the file input) opens the picker;
	 *   once a file is chosen a "Save" submit button appears (pure CSS, `:has(input:valid)`), and the
	 *   form posts as plain multipart.
	 * - JS: picking a file downscales it in the browser, then submits immediately via `use:enhance`.
	 *   HEIC files the browser can't convert get a clear message instead of a failed upload.
	 */
	import { onMount, type Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, cn, toast } from '#lib/ui/index.ts';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import { downscaleInput, isHeic, type ResizeOptions } from '#lib/client/resize-image.ts';

	type Props = {
		action: string;
		removeAction?: string | null;
		field: string;
		/** Is there a current image (switches Upload → Change and shows Remove). */
		hasImage: boolean;
		noun?: string;
		resize: ResizeOptions;
		accept?: string;
		hint?: string;
		/** Server message for this form (error) and success text (no-JS feedback). */
		error?: string | null;
		success?: string | null;
		testid?: string;
		class?: string;
		preview?: Snippet<[{ busy: boolean }]>;
	};
	let {
		action,
		removeAction = null,
		field,
		hasImage,
		noun = 'photo',
		resize,
		accept = 'image/png,image/jpeg,image/webp,image/heic,image/heif',
		hint = 'JPG, PNG or WebP, up to 5 MB.',
		error = null,
		success = null,
		testid = 'image',
		class: className,
		preview
	}: Props = $props();

	let hydrated = $state(false);
	let busy = $state(false);
	let clientError = $state<string | null>(null);
	let form = $state<HTMLFormElement>();
	onMount(() => (hydrated = true));

	async function onchange(e: Event & { currentTarget: HTMLInputElement }) {
		if (!hydrated) return;
		const input = e.currentTarget;
		clientError = null;
		const picked = input.files?.[0];
		if (!picked) return;
		busy = true;
		const file = await downscaleInput(input, resize);
		if (file && isHeic(file)) {
			busy = false;
			input.value = '';
			clientError = 'This browser can’t read iPhone HEIC photos. Choose a JPG or PNG (on iPhone: Settings → Camera → Formats → Most Compatible), or upload from Safari.';
			return;
		}
		form?.requestSubmit();
	}
</script>

<div class={cn('min-w-0', className)} data-testid="{testid}-upload">
	{#if preview}{@render preview({ busy })}{/if}
	<div class="flex flex-wrap items-center gap-2">
		<form
			method="POST"
			{action}
			enctype="multipart/form-data"
			class="group/up flex flex-wrap items-center gap-2"
			bind:this={form}
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: true });
					busy = false;
					const msg = (result.type === 'success' ? (result.data as { success?: string } | undefined)?.success : null) ?? null;
					if (msg) toast.success(msg);
				};
			}}
		>
			<label
				class={cn(
					'inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 text-sm font-medium text-fg transition-colors select-none hover:bg-elevated',
					'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
					busy && 'pointer-events-none opacity-60'
				)}
				data-testid="{testid}-choose"
			>
				<input type="file" name={field} {accept} required class="sr-only" {onchange} data-testid="{testid}-input" />
				<JIcon name={busy ? 'clock' : 'upload'} class="size-4" />
				{busy ? 'Uploading…' : hasImage ? `Change ${noun}` : `Upload ${noun}`}
			</label>
			{#if !hydrated}
				<!-- No-JS: appears once a file is picked. -->
				<span class="hidden group-has-[input:valid]/up:inline-flex">
					<Button type="submit" data-testid="{testid}-save">Save {noun}</Button>
				</span>
			{/if}
		</form>
		{#if hasImage && removeAction}
			<form
				method="POST"
				action={removeAction}
				use:enhance={() => {
					busy = true;
					return async ({ result, update }) => {
						await update();
						busy = false;
						const msg = (result.type === 'success' ? (result.data as { success?: string } | undefined)?.success : null) ?? null;
						if (msg) toast.success(msg);
					};
				}}
			>
				<Button type="submit" variant="ghost" disabled={busy} data-testid="{testid}-remove">
					<JIcon name="trash" class="size-4" />Remove
				</Button>
			</form>
		{/if}
	</div>
	<p class="mt-1.5 text-xs text-subtle">{hint}</p>
	<FormAlert class="mt-2" message={clientError ?? error} />
	{#if !hydrated && success}<FormAlert class="mt-2" tone="success" message={success} />{/if}
</div>
