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
	$effect.pre(() => {
		flagged = errorSection;
	});

	function check(f: FormData): string | null {
		for (const [i, s] of sections.entries()) {
			if (s.type === 'signature' && !String(f.get(`sig_${i}`) ?? '')) {
				flagged = i;
				document.getElementById(`waiver-section-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
				return `Please sign “${s.title}”.`;
			}
		}
		flagged = null;
		if (!String(f.get('signature') ?? '')) return guardian ? 'The jumper needs to sign in the box.' : 'Please sign in the signature box.';
		if (guardian && !String(f.get('guardian_signature') ?? '')) return 'The parent / guardian needs to sign too.';
		return null;
	}
</script>

<form
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
	<WaiverForm {sections} {dropzoneName} {signerName} {title} {guardian} {guardianName} errorSection={flagged} />
	<Button type="submit" size="lg" loading={busy} class="w-full sm:w-auto sm:self-end" data-testid="sign-submit">
		<Icon name="waiver" class="size-4" />
		{submitLabel}
	</Button>
</form>
