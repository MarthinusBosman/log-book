<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Card, Icon, cn } from '#lib/ui/index.ts';
	import ImageUpload from '#lib/components/ImageUpload.svelte';
	import { IMAGE_PRESETS } from '#lib/client/resize-image.ts';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import { DEFAULT_BRAND_COLOR, brandTheme, modeVars, normalizeHex, type ThemeChoice } from '#lib/branding.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const f = $derived(form as { action?: string; message?: string; ok?: boolean; success?: string } | null);

	const initColor = () => data.branding.color ?? DEFAULT_BRAND_COLOR;
	let hex = $state(initColor());
	let picker = $state(initColor());
	const initTheme = (): ThemeChoice | '' => data.branding.theme ?? '';
	let themeChoice = $state<ThemeChoice | ''>(initTheme());
	let saving = $state(false);
	// Re-sync after a save/reset reloads the data.
	const snapshot = () => `${data.branding.color}|${data.branding.theme}`;
	let seen = $state(snapshot());
	$effect.pre(() => {
		if (snapshot() !== seen) {
			seen = snapshot();
			hex = picker = initColor();
			themeChoice = initTheme();
		}
	});

	const valid = $derived(normalizeHex(hex));
	const theme = $derived(brandTheme(valid ?? DEFAULT_BRAND_COLOR));
	const styleOf = (vars: Record<string, string>) =>
		Object.entries(vars)
			.map(([k, v]) => `${k}:${v}`)
			.join(';');
	const lightStyle = $derived(styleOf(modeVars(theme.light, theme.palette, 'light')));
	const darkStyle = $derived(styleOf(modeVars(theme.dark, theme.palette, 'dark')));
	const ratio = (n: number) => `${(Math.floor(n * 10) / 10).toFixed(1)}:1`;

	const SWATCHES = ['#1e6bff', '#ff6a00', '#e11d48', '#7c3aed', '#0d9488', '#14532d', '#ca8a04', '#be185d'];
	const THEMES: { value: ThemeChoice | ''; label: string; hint: string }[] = [
		{ value: '', label: 'App default', hint: 'Dark' },
		{ value: 'system', label: 'System', hint: 'Follow the visitor’s device' },
		{ value: 'dark', label: 'Dark', hint: 'Best on hangar TVs' },
		{ value: 'light', label: 'Light', hint: 'Bright, print-like' }
	];
</script>

<svelte:head><title>Settings · Branding</title></svelte:head>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-5">
	<div class="min-w-0 space-y-6 xl:col-span-2">
		<form method="POST" action="?/style" use:enhance={toastEnhance({ pending: (v) => (saving = v) })} data-testid="branding-form">
			<Card title="Brand colour" description="Buttons, links, highlights and the focus ring use this colour for everyone while {data.dzName} is their active dropzone, and on your public pages.">
				<input type="hidden" name="previous" value={data.branding.color ?? ''} />
				<div class="flex flex-wrap items-end gap-3">
					<label class="flex flex-col gap-1.5 text-sm font-medium">
						Pick
						<input
							type="color"
							name="colorPicker"
							bind:value={picker}
							oninput={() => (hex = picker)}
							class="h-10 w-14 cursor-pointer rounded-xl border border-border bg-surface-2 p-1"
							data-testid="color-picker"
						/>
					</label>
					<label class="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
						Hex
						<input
							name="color"
							bind:value={hex}
							oninput={() => {
								const n = normalizeHex(hex);
								if (n) picker = n;
							}}
							maxlength="7"
							spellcheck="false"
							autocomplete="off"
							placeholder="#FF6A00"
							class={cn(
								'h-10 w-full rounded-xl border bg-surface-2 px-3 font-mono text-sm uppercase outline-none focus:border-primary',
								valid ? 'border-border' : 'border-danger'
							)}
							aria-invalid={!valid}
							data-testid="color-hex"
						/>
					</label>
				</div>
				<div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggested colours">
					{#each SWATCHES as c (c)}
						<button
							type="button"
							class={cn('size-7 rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110', valid === c && 'ring-2 ring-fg')}
							style="background:{c}"
							aria-label="Use {c}"
							onclick={() => (hex = picker = c)}
						></button>
					{/each}
				</div>

				<dl class="mt-4 grid grid-cols-2 gap-2 text-xs">
					{#each [{ label: 'Light mode', m: theme.light }, { label: 'Dark mode', m: theme.dark }] as row (row.label)}
						<div class="rounded-xl border border-border p-2.5">
							<dt class="text-subtle">{row.label}</dt>
							<dd class="mt-1 flex items-center gap-2">
								<span class="size-4 rounded-full border border-border" style="background:{row.m.primary}"></span>
								<span class="font-mono">{row.m.primary.toUpperCase()}</span>
								<Badge tone={row.m.adjusted ? 'warning' : 'success'} class="ml-auto">{ratio(row.m.ratio)}</Badge>
							</dd>
						</div>
					{/each}
				</dl>
				{#if !valid}
					<FormAlert class="mt-3" message="Enter a 6-digit hex colour like #FF6A00." />
				{:else}
					{#each theme.warnings as w (w)}
						<p class="mt-3 flex gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning" data-testid="contrast-warning">
							<Icon name="zap" class="mt-px size-3.5 shrink-0" />{w}
						</p>
					{/each}
				{/if}

				<fieldset class="mt-6 min-w-0">
					<legend class="text-sm font-medium">Default theme for public pages & display</legend>
					<p class="mt-0.5 text-xs text-muted">Visitors who picked a theme keep theirs. The app itself follows each user’s own choice.</p>
					<div class="mt-3 grid grid-cols-2 gap-2">
						{#each THEMES as t (t.value)}
							<label
								class={cn(
									'cursor-pointer rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
									themeChoice === t.value ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong'
								)}
							>
								<input type="radio" name="theme" value={t.value} bind:group={themeChoice} class="sr-only" />
								<span class="block font-medium">{t.label}</span>
								<span class="block text-xs text-muted">{t.hint}</span>
							</label>
						{/each}
					</div>
				</fieldset>
				{#if f?.action === 'style' && f.message}<FormAlert class="mt-4" tone={f.ok ? 'success' : 'error'} message={f.message} />{/if}
				{#snippet footer()}
					<div class="flex flex-wrap items-center justify-between gap-2">
						<Button type="submit" variant="ghost" formaction="?/reset" data-testid="branding-reset">Reset to default</Button>
						<Button type="submit" loading={saving} disabled={!valid} data-testid="branding-save">Save branding</Button>
					</div>
				{/snippet}
			</Card>
		</form>

		<Card title="Logo" description="Shown in the app sidebar while your dropzone is active, on your public pages, booking flow, hangar display and waiver / tandem PDFs. A square or wide PNG with a transparent background works best.">
			<ImageUpload
				action="?/logo"
				removeAction="?/removeLogo"
				field="logo"
				hasImage={!!data.branding.logoUrl}
				noun="logo"
				testid="logo"
				hint="PNG, JPG or WebP. Resized to 512 px (PNG keeps transparency)."
				resize={IMAGE_PRESETS.logo}
				error={f?.action === 'logo' ? (f.message ?? null) : null}
				success={f?.action === 'logo' ? (f.success ?? null) : null}
			>
				{#snippet preview()}
					<div class="mb-4 grid grid-cols-2 gap-2">
						<div class="light-scope grid h-20 place-items-center rounded-xl border border-border bg-surface p-3">
							{#if data.branding.logoUrl}<img src={data.branding.logoUrl} alt="{data.dzName} logo on light" class="max-h-full max-w-full object-contain" data-testid="logo-preview" />{:else}<span class="text-xs text-muted">No logo</span>{/if}
						</div>
						<div class="dark-scope grid h-20 place-items-center rounded-xl border border-border bg-surface p-3">
							{#if data.branding.logoUrl}<img src={data.branding.logoUrl} alt="{data.dzName} logo on dark" class="max-h-full max-w-full object-contain" />{:else}<span class="text-xs text-muted">No logo</span>{/if}
						</div>
					</div>
				{/snippet}
			</ImageUpload>
		</Card>
	</div>

	<section class="min-w-0 xl:col-span-3" aria-label="Live preview">
		<h2 class="mb-3 text-sm font-medium text-muted">Live preview</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="branding-preview">
			{#each [{ cls: 'light-scope', style: lightStyle, label: 'Light' }, { cls: 'dark-scope', style: darkStyle, label: 'Dark' }] as p (p.label)}
				<div class={cn(p.cls, 'min-w-0 rounded-2xl border border-border bg-bg p-4 text-fg')} style={p.style}>
					<div class="mb-4 flex items-center justify-between gap-2">
						<div class="flex min-w-0 items-center gap-2">
							{#if data.branding.logoUrl}
								<img src={data.branding.logoUrl} alt="" class="h-7 max-w-24 object-contain" />
							{:else}
								<span class="grid size-7 place-items-center rounded-lg bg-primary text-[10px] font-bold text-primary-fg">{data.dzName.slice(0, 2).toUpperCase()}</span>
							{/if}
							<span class="truncate text-sm font-semibold">{data.dzName}</span>
						</div>
						<span class="text-[11px] text-subtle">{p.label}</span>
					</div>
					<div class="flex flex-wrap gap-2">
						<span class="inline-flex h-9 items-center rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-fg shadow-glow">Join load</span>
						<span class="inline-flex h-9 items-center rounded-xl bg-brand-600 px-3.5 text-sm font-medium text-primary-fg">Hover</span>
						<span class="inline-flex h-9 items-center rounded-xl border border-border bg-surface-2 px-3.5 text-sm font-medium">Cancel</span>
					</div>
					<div class="mt-3 flex flex-wrap gap-1.5">
						<Badge tone="brand" dot>Open</Badge>
						<Badge tone="success">Paid</Badge>
						<Badge tone="warning">20 min call</Badge>
						<Badge>Belly</Badge>
					</div>
					<div class="mt-4 rounded-xl border border-primary/40 bg-surface p-3">
						<div class="flex items-center gap-2.5">
							<span class="grid size-9 place-items-center rounded-lg bg-primary/15 text-sm font-semibold text-primary">4</span>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold">Load 4</p>
								<p class="truncate text-xs text-muted">10:30 · Cessna Caravan</p>
							</div>
							<span class="text-xs font-medium text-primary">3 seats left</span>
						</div>
						<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div class="h-full w-3/4 rounded-full bg-primary"></div></div>
						<p class="mt-3 text-xs text-muted">You’re on this load · <span class="font-medium text-primary underline">View slot</span></p>
					</div>
				</div>
			{/each}
		</div>
	</section>
</div>
