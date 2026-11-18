<script lang="ts">
	/**
	 * A complete signing form: WaiverForm + submit, with client checks for the signature pads
	 * (checkboxes/initials use native `required`). Posts to `action`.
	 */
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, Icon } from '#lib/ui/index.ts';
	import type { IndemnitySectionType } from '#lib/domain/constants.ts';
	import { toastEnhance } from '#lib/components/tandems/enhance.ts';
	import WaiverForm from './WaiverForm.svelte';

	type Props = {
		action: string;
		sections: { title: string; content: string; type: IndemnitySectionType }[];
		dropzoneName: string;
		signerName: string;
		title?: string;
		guardian?: boolean;
		guardianName?: string;
		errorSection?: number | null;
		submitLabel?: string;
		/** Extra fields rendered above the form (e.g. signer name). */
		header?: Snippet;
		onSigned?: () => void;
	};
	let {
		action,
		sections,
		dropzoneName,
		signerName,
		title,
		guardian = false,
		guardianName = '',
		errorSection = null,
		submitLabel = 'Sign waiver',
		header,
		onSigned
	}: Props = $props();

	let busy = $state(false);
	let flagged = $state<number | null>(null);
	let padErrors = $state<Record<string, string>>({});
	$effect.pre(() => {
		flagged = errorSection;
	});

	/**
	 * Empty signature pads → per-pad messages (all at once, so one round of fixes), the first
	 * one scrolled into view. Returns the toast text for the first problem, or null when signed.
	 */
	function check(f: FormData): string | null {
		const missing: [string, string][] = [];
		for (const [i, s] of sections.entries()) {
			if (s.type === 'signature' && !String(f.get(`sig_${i}`) ?? '')) missing.push([`sig_${i}`, `Please sign “${s.title}”.`]);
		}
		if (!String(f.get('signature') ?? '')) missing.push(['signature', guardian ? 'The jumper needs to sign in the box.' : 'Please sign in the signature box.']);
		if (guardian && !String(f.get('guardian_signature') ?? '')) missing.push(['guardian_signature', 'The parent / guardian needs to sign too.']);
		padErrors = Object.fromEntries(missing);
		const first = missing[0]?.[0];
		flagged = first?.startsWith('sig_') ? Number(first.slice(4)) : null;
		if (!first) return null;
		form?.querySelector(`[data-pad="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		return missing[0][1];
	}

	function padChanged(name: string, value: string) {
		if (!value || !padErrors[name]) return;
		const { [name]: _done, ...rest } = padErrors;
		padErrors = rest;
		if (name === `sig_${flagged}`) flagged = null;
	}

	let form: HTMLFormElement | undefined = $state();
</script>

<form
	bind:this={form}
	method="POST"
	{action}
	use:enhance={toastEnhance({
		before: check,
		pending: (on) => (busy = on),
		onSuccess: () => onSigned?.()
	})}
	class="flex flex-col gap-4"
	data-testid="sign-form"
>
	{@render header?.()}
	<WaiverForm {sections} {dropzoneName} {signerName} {title} {guardian} {guardianName} errorSection={flagged} {padErrors} onpadchange={padChanged} />
	<Button type="submit" size="lg" loading={busy} class="w-full sm:w-auto sm:self-end" data-testid="sign-submit">
		<Icon name="waiver" class="size-4" />
		{submitLabel}
	</Button>
</form>
