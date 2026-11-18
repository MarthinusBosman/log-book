<script lang="ts">
	import { telHref } from '#lib/components/jumper/hours.ts';

	// Shown where a booking calendar would be when the dropzone has no bookable times: point the
	// customer at the DZ's phone/email instead of a dead-end "Book a tandem" flow.
	let {
		dz,
		class: klass = ''
	}: { dz: { name: string; contactPhone: string | null; contactEmail: string | null }; class?: string } = $props();
	const contact = $derived(!!(dz.contactPhone?.trim() || dz.contactEmail?.trim()));
</script>

<div class={klass} data-testid="no-booking-times">
	{#if contact}
		<p class="text-sm text-muted">No online booking times are open right now. Call or email {dz.name} and they’ll find you a slot.</p>
		<div class="mt-3 flex flex-col gap-1 text-sm">
			{#if dz.contactPhone?.trim()}<a href={telHref(dz.contactPhone)} class="font-medium text-primary hover:underline">{dz.contactPhone}</a>{/if}
			{#if dz.contactEmail?.trim()}<a href="mailto:{dz.contactEmail}" class="font-medium break-all text-primary hover:underline">{dz.contactEmail}</a>{/if}
		</div>
	{:else}
		<p class="text-sm text-muted">Online booking isn’t open yet. Check back soon.</p>
	{/if}
</div>
