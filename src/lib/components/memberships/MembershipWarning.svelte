<script lang="ts">
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { cn } from '#lib/ui/index.ts';

	/** Jumper-facing "PASA Expired" notice (check-in / join load), copy from the original app. */
	let { label, class: className }: { label: string; class?: string } = $props();
	const assoc = $derived(label.replace(/ expired$/i, ''));
</script>

<a
	href="/app/profile?tab=credentials"
	class={cn('flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm transition-colors hover:border-danger/50', className)}
	data-testid="membership-warning"
>
	<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger"><JIcon name="alert" class="size-4" /></span>
	<span class="min-w-0 flex-1">
		<span class="block font-semibold text-danger">{assoc} Expired</span>
		<span class="block text-muted">Your membership to {assoc} has expired. If you have paid, please reconnect to {assoc} in your profile. Manifest can still add you if they’ve checked your card.</span>
	</span>
	<JIcon name="chevronRight" class="mt-2 size-4 shrink-0 text-muted" />
</a>
