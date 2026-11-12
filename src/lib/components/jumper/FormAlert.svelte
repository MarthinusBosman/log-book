<script lang="ts">
	import { cn } from '#lib/ui/index.ts';
	import JIcon from './JIcon.svelte';

	type Props = { message?: string | null; tone?: 'error' | 'success' | 'info'; class?: string };
	let { message, tone = 'error', class: className }: Props = $props();
	const tones = {
		error: 'border-danger/30 bg-danger/10 text-danger',
		success: 'border-success/30 bg-success/10 text-success',
		info: 'border-primary/30 bg-primary/10 text-primary'
	};
</script>

{#if message}
	<p
		class={cn('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm', tones[tone], className)}
		role={tone === 'error' ? 'alert' : 'status'}
		data-testid="form-{tone}"
	>
		<JIcon name={tone === 'success' ? 'checkCircle' : 'alert'} class="mt-px size-4" />
		<span>{message}</span>
	</p>
{/if}
