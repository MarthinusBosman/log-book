<script lang="ts">
	import { cn } from '#lib/ui/index.ts';

	type Props = {
		name: string;
		label: string;
		symbol: string;
		value?: string;
		help?: string;
		error?: string | null;
		allowNegative?: boolean;
		required?: boolean;
		class?: string;
		compact?: boolean;
	};
	let { name, label, symbol, value = $bindable(''), help, error, allowNegative = false, required = false, class: className, compact = false }: Props = $props();
	const uid = $props.id();
</script>

<div class={cn('flex flex-col gap-1', className)}>
	<label for="m-{uid}" class={cn('font-medium text-fg', compact ? 'text-sm' : 'text-sm')}>{label}</label>
	<div
		class={cn(
			'flex h-10 items-center rounded-xl border bg-surface transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15',
			error ? 'border-danger' : 'border-border hover:border-border-strong'
		)}
	>
		<span class="pl-3 text-sm text-subtle select-none">{symbol}</span>
		<input
			id="m-{uid}"
			{name}
			bind:value
			inputmode="decimal"
			autocomplete="off"
			{required}
			pattern={allowNegative ? '-?[0-9 ,]*([.,][0-9]{0,2})?' : '[0-9 ,]*([.,][0-9]{0,2})?'}
			aria-invalid={error ? true : undefined}
			class="h-full w-full min-w-0 bg-transparent px-2 text-right text-[15px] text-fg tabular-nums outline-none placeholder:text-subtle"
			placeholder="0.00"
		/>
	</div>
	{#if error}<p class="text-xs text-danger">{error}</p>{:else if help}<p class="text-xs text-muted">{help}</p>{/if}
</div>
