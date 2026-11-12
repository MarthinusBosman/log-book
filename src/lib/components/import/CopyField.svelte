<script lang="ts">
	import { cn } from '#lib/ui/cn.ts';
	import Glyph from './Glyph.svelte';

	let { label, value, secret = false, testid }: { label: string; value: string; secret?: boolean; testid?: string } = $props();
	let copied = $state(false);
	let show = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard blocked: the value is selectable */
		}
	}
</script>

<div class="min-w-0">
	<p class="text-xs font-medium text-muted">{label}</p>
	<div class="mt-1 flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5">
		<code class={cn('min-w-0 flex-1 truncate text-xs select-all', secret && !show && 'blur-[3px] hover:blur-none')} data-testid={testid}>{value}</code>
		{#if secret}
			<button type="button" class="rounded px-1.5 text-xs text-muted hover:text-fg" onclick={() => (show = !show)}>{show ? 'Hide' : 'Show'}</button>
		{/if}
		<button type="button" class="grid size-7 place-items-center rounded text-muted hover:bg-surface-2 hover:text-fg" onclick={copy} aria-label="Copy {label}">
			{#if copied}<span class="text-xs text-success">✓</span>{:else}<Glyph name="copy" class="size-3.5" />{/if}
		</button>
	</div>
</div>
