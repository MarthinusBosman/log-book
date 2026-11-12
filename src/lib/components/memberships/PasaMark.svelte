<script lang="ts">
	import JIcon from '#lib/components/jumper/JIcon.svelte';

	/** Compact PASA link marker for staff lists. */
	let { state }: { state?: 'verified' | 'needs_review' | 'lapsed' | 'rejected' } = $props();
</script>

{#if state === 'verified'}
	<span class="inline-flex align-middle text-success" role="img" aria-label="Verified with PASA" title="Verified with PASA" data-testid="pasa-mark-verified"><JIcon name="badgeCheck" class="size-4" /></span>
{:else if state === 'needs_review'}
	<span class="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 align-middle text-[11px] font-medium text-warning" title="PASA link waiting for staff confirmation" data-testid="pasa-mark-review">
		<JIcon name="alert" class="size-3" /> Confirm PASA
	</span>
{:else if state === 'lapsed'}
	<span class="inline-flex align-middle text-danger" role="img" aria-label="PASA lapsed" title="Not on PASA's current members list"><JIcon name="alert" class="size-4" /></span>
{/if}
