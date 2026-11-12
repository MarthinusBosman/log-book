<script lang="ts" module>
	export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
	export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from './cn.ts';

	type Props = {
		variant?: ButtonVariant;
		size?: ButtonSize;
		loading?: boolean;
		href?: string;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLButtonAttributes, 'class'> &
		Omit<HTMLAnchorAttributes, 'class'>;

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		href,
		class: className,
		children,
		type = 'button',
		disabled,
		...rest
	}: Props = $props();

	const variants: Record<ButtonVariant, string> = {
		primary:
			'bg-primary text-primary-fg shadow-sm shadow-brand-500/20 hover:bg-brand-600 hover:shadow-glow active:bg-brand-700',
		secondary: 'bg-surface-2 text-fg hover:bg-elevated border border-border',
		outline: 'border border-border-strong text-fg hover:bg-surface-2',
		ghost: 'text-muted hover:text-fg hover:bg-surface-2',
		danger: 'bg-danger text-white hover:opacity-90'
	};
	const sizes: Record<ButtonSize, string> = {
		sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
		md: 'h-10 px-4 text-sm gap-2 rounded-xl',
		lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
		icon: 'size-10 rounded-xl'
	};

	const classes = $derived(
		cn(
			'inline-flex select-none items-center justify-center font-medium whitespace-nowrap',
			'transition-[background-color,box-shadow,color,opacity,transform] duration-150 active:scale-[0.98]',
			'disabled:pointer-events-none disabled:opacity-50',
			variants[variant],
			sizes[size],
			className
		)
	);
</script>

{#if href}
	<a {href} class={classes} aria-disabled={disabled || undefined} {...rest as HTMLAnchorAttributes}>
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		class={classes}
		disabled={disabled || loading}
		aria-busy={loading || undefined}
		{...rest as HTMLButtonAttributes}
	>
		{#if loading}
			<svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" stroke-width="3" />
				<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
			</svg>
		{/if}
		{@render children?.()}
	</button>
{/if}
