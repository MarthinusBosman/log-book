<script lang="ts">
	/**
	 * Renders an indemnity form (sections + answers + signature pads). Field names posted:
	 * ack_<i>, initials_<i>, sig_<i> (per section), signature, guardian_signature, guardian_name.
	 * `preview` renders the same thing read-only with a PREVIEW ribbon (form builder).
	 */
	import { Input, cn } from '#lib/ui/index.ts';
	import SignaturePad from './SignaturePad.svelte';
	import type { IndemnitySectionType } from '#lib/domain/constants.ts';

	type Section = { title: string; content: string; type: IndemnitySectionType };
	type Props = {
		sections: Section[];
		title?: string;
		dropzoneName: string;
		signerName?: string;
		preview?: boolean;
		guardian?: boolean;
		guardianName?: string;
		/** Index of a section the server flagged (scroll + highlight). */
		errorSection?: number | null;
		class?: string;
	};
	let {
		sections,
		title = 'Indemnity & Waiver Agreement',
		dropzoneName,
		signerName = '',
		preview = false,
		guardian = false,
		guardianName = '',
		errorSection = null,
		class: className
	}: Props = $props();

	const today = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date());
</script>

<div class={cn('relative rounded-2xl border border-border bg-surface', className)}>
	{#if preview}
		<div class="absolute top-3 right-3 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-warning uppercase">
			Preview only
		</div>
	{/if}
	<header class="border-b border-border px-5 py-4 sm:px-6">
		<p class="text-xs font-medium tracking-wider text-primary uppercase">{dropzoneName}</p>
		<h3 class="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
		<p class="mt-1 text-sm text-muted">Please read every section carefully before signing.</p>
	</header>

	<ol class="divide-y divide-border">
		{#each sections as s, i (i)}
			<li
				id="waiver-section-{i}"
				class={cn('px-5 py-4 sm:px-6', errorSection === i && 'bg-danger/5 ring-1 ring-danger/40 ring-inset')}
			>
				<h4 class="flex gap-2 font-medium">
					<span class="text-subtle tabular-nums">{i + 1}.</span>
					{s.title}
				</h4>
				{#if s.content}
					<p class="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-muted">{s.content}</p>
				{/if}
				{#if s.type === 'acknowledgement'}
					<label class="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-2/50 p-3 text-sm has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
						<input
							type="checkbox"
							name="ack_{i}"
							required={!preview}
							disabled={preview}
							class="mt-0.5 size-5 shrink-0 accent-[var(--dz-primary)]"
						/>
						<span>I have read, understand and accept this section.</span>
					</label>
				{:else if s.type === 'initials'}
					<div class="mt-3 flex items-center gap-3">
						<Input
							name="initials_{i}"
							aria-label="Initials for {s.title}"
							placeholder="Initials"
							maxlength={6}
							autocomplete="off"
							required={!preview}
							disabled={preview}
							class="w-32"
						/>
						<span class="text-sm text-muted">Type your initials to confirm.</span>
					</div>
				{:else if s.type === 'signature'}
					<SignaturePad name="sig_{i}" label={s.title} disabled={preview} class="mt-3" />
				{/if}
			</li>
		{:else}
			<li class="px-6 py-8 text-center text-sm text-muted">This form has no sections yet.</li>
		{/each}
	</ol>

	<div class={cn('grid gap-5 border-t border-border px-5 py-5 sm:px-6', guardian && 'sm:grid-cols-2')}>
		<SignaturePad name="signature" label={guardian ? 'Jumper signature' : 'Your signature'} signer={signerName || (preview ? 'John Doe' : '')} disabled={preview} />
		{#if guardian}
			<div class="flex flex-col gap-3">
				<SignaturePad name="guardian_signature" label="Parent / guardian signature" signer={guardianName} disabled={preview} />
				<Input name="guardian_name" label="Guardian full name" value={guardianName} required={!preview} disabled={preview} />
			</div>
		{/if}
		<p class="text-xs text-subtle sm:col-span-2">
			Signed by <span class="font-medium text-muted">{signerName || (preview ? 'John Doe' : 'you')}</span> on {today}. Your signature, the text
			above and a timestamp are stored as a PDF.
		</p>
	</div>
</div>
