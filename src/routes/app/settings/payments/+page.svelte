<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Card, Icon, Input, toast } from '#lib/ui/index.ts';
	import Switch from '#lib/components/staffadmin/Switch.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import { FEES_CHECKED, FEE_RECOMMENDATION, SA_FEES } from '#lib/components/payments/fees.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let busy = $state<string | null>(null);
	const pending = (key: string) => (v: boolean) => (busy = v ? key : null);

	type Id = 'payfast' | 'paystack' | 'yoco' | 'stripe';
	const LABEL: Record<Id, string> = { payfast: 'PayFast', paystack: 'Paystack', yoco: 'Yoco', stripe: 'Stripe' };

	function status(id: Id): { tone: 'success' | 'warning' | 'neutral' | 'danger'; text: string } {
		const s = data.state[id];
		if (!s.configured) return { tone: 'neutral', text: 'Not connected' };
		if (s.broken) return { tone: 'danger', text: 'Re-enter keys' };
		if (!data.supported[id]) return { tone: 'warning', text: `No ${data.currency}` };
		if (s.missing) return { tone: 'warning', text: 'Almost ready' };
		if (!s.enabled) return { tone: 'neutral', text: 'Off' };
		return { tone: 'success', text: s.testMode ? 'Ready · test mode' : 'Ready · live' };
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied');
		} catch {
			toast.error('Copy failed — select the text instead');
		}
	}

	const recentTone = (s: string) => (s === 'succeeded' ? 'success' : s === 'pending' ? 'brand' : s === 'refunded' ? 'neutral' : 'warning') as 'success' | 'brand' | 'neutral' | 'warning';
	const purposeLabel = (p: string) => (p === 'wallet_topup' ? 'Wallet top-up' : p === 'tandem_deposit' ? 'Tandem deposit' : 'Tandem payment');
</script>

<svelte:head><title>Settings · Payments</title></svelte:head>

{#snippet badge(id: Id)}
	{@const st = status(id)}
	<Badge tone={st.tone} dot={st.tone === 'success'}>{st.text}</Badge>
{/snippet}

{#snippet webhook(id: Id, help: string)}
	<div class="rounded-xl border border-border bg-surface-2/40 p-3">
		<p class="text-xs text-muted">{help}</p>
		<div class="mt-2 flex items-center gap-2">
			<code class="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={data.webhooks[id]} data-testid="webhook-{id}">{data.webhooks[id]}</code>
			<Button type="button" size="sm" variant="ghost" onclick={() => copy(data.webhooks[id])} aria-label="Copy {LABEL[id]} webhook URL">Copy</Button>
		</div>
	</div>
{/snippet}

{#snippet footerButtons(id: Id, saveLabel: string)}
	<div class="flex flex-wrap gap-2">
		<Button type="submit" loading={busy === `${id}-save`} data-testid="save-{id}">{saveLabel}</Button>
		{#if data.state[id].configured}
			<Button type="submit" variant="secondary" formaction="?/test" formnovalidate data-testid="test-{id}">Test connection</Button>
			<Button type="submit" variant="ghost" formaction="?/remove" formnovalidate>Disconnect</Button>
		{/if}
	</div>
{/snippet}

{#if !data.paymentsOn}
	<div class="mb-6 flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
		<p class="text-fg"><span class="font-medium text-warning">Online payments are off.</span> Connect a provider below, then switch “In-app payments” on under Features.</p>
		<Button href="/app/settings/features" size="sm" variant="secondary">Open features</Button>
	</div>
{/if}
{#if data.devKey}
	<p class="mb-6 rounded-2xl border border-border bg-surface-2/60 px-4 py-3 text-sm text-muted">
		<Icon name="shield" class="mr-1 inline size-4 align-[-3px] text-warning" />
		Keys are encrypted with a development key. Set <code class="font-mono text-fg">SECRETS_KEY</code> on the server before going live.
	</p>
{/if}

<section class="mb-6 rounded-2xl border border-border bg-surface p-5" data-testid="fees">
	<div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
		<h2 class="font-semibold">Get paid straight into your own account</h2>
		<p class="text-xs text-subtle">Provider fees excl. VAT · checked {FEES_CHECKED}</p>
	</div>
	<p class="mt-1 text-sm text-muted">
		Log-Book is free and never touches your money: each provider pays out to your dropzone’s own merchant account. Cash, card and EFT at manifest keep working as before.
	</p>
	<ul class="mt-4 divide-y divide-border text-sm sm:hidden">
		{#each SA_FEES as r (r.provider)}
			<li class="py-2.5 {r.integrated ? '' : 'text-subtle'}">
				<p class="flex items-baseline justify-between gap-3">
					<span class="font-medium">{r.provider}</span>
					<span class="text-xs tabular-nums whitespace-nowrap">Cards {r.card} · EFT {r.eft}</span>
				</p>
				<p class="mt-0.5 text-xs text-muted">{r.other}</p>
			</li>
		{/each}
	</ul>
	<div class="relative mt-4 hidden overflow-x-auto sm:block">
		<table class="w-full min-w-[32rem] text-left text-sm">
			<thead class="text-xs text-subtle">
				<tr><th class="py-1.5 pr-3 font-medium">Provider</th><th class="py-1.5 pr-3 font-medium">Cards</th><th class="py-1.5 pr-3 font-medium">Instant EFT</th><th class="py-1.5 font-medium">Notes</th></tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#each SA_FEES as r (r.provider)}
					<tr class={r.integrated ? '' : 'text-subtle'}>
						<td class="py-2 pr-3 font-medium">{r.provider}</td>
						<td class="py-2 pr-3 whitespace-nowrap tabular-nums">{r.card}</td>
						<td class="py-2 pr-3 whitespace-nowrap tabular-nums">{r.eft}</td>
						<td class="py-2 text-muted">{r.other}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-sm text-fg"><Icon name="zap" class="mr-1 inline size-4 align-[-3px] text-primary" />{FEE_RECOMMENDATION}</p>
</section>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
	<!-- Paystack -->
	<Card title="Paystack" description="Cards, Apple Pay and EFT · South Africa, Nigeria, Ghana, Kenya." data-testid="card-paystack">
		{#snippet actions()}{@render badge('paystack')}{/snippet}
		<form method="POST" action="?/paystack" use:enhance={toastEnhance({ pending: pending('paystack-save'), reset: true })} class="space-y-4" autocomplete="off">
			<input type="hidden" name="provider" value="paystack" />
			<Input
				label="Secret key"
				name="secretKey"
				type="password"
				autocomplete="new-password"
				placeholder={data.masked.paystack.secretKey ?? 'sk_test_… or sk_live_…'}
				hint={data.masked.paystack.secretKey ? 'Stored encrypted. Leave blank to keep it.' : 'Paystack Dashboard → Settings → API Keys & Webhooks.'}
			/>
			{@render webhook('paystack', 'Paste this as the Webhook URL in Paystack → Settings → API Keys & Webhooks (test and live).')}
			<div class="rounded-xl border border-border px-3">
				<Switch name="enabled" label="Offer Paystack" description="Show it at checkout. Test keys (sk_test_) never move real money." checked={data.state.paystack.enabled} />
			</div>
			{@render footerButtons('paystack', data.state.paystack.configured ? 'Save Paystack' : 'Connect Paystack')}
		</form>
	</Card>

	<!-- Yoco -->
	<Card title="Yoco" description="Cards, Apple Pay and Google Pay · South Africa (ZAR)." data-testid="card-yoco">
		{#snippet actions()}{@render badge('yoco')}{/snippet}
		<form method="POST" action="?/yoco" use:enhance={toastEnhance({ pending: pending('yoco-save'), reset: true })} class="space-y-4" autocomplete="off">
			<input type="hidden" name="provider" value="yoco" />
			<Input
				label="Secret key"
				name="secretKey"
				type="password"
				autocomplete="new-password"
				placeholder={data.masked.yoco.secretKey ?? 'sk_test_… or sk_live_…'}
				hint={data.masked.yoco.secretKey ? 'Stored encrypted. Leave blank to keep it.' : 'Yoco App → Online payments → Checkout API → How to connect.'}
			/>
			<div class="rounded-xl border border-border bg-surface-2/40 p-3 text-sm">
				{#if data.masked.yoco.webhookSecret}
					<p class="flex items-center gap-2 font-medium text-success"><Icon name="check" class="size-4" /> Webhook registered</p>
					<p class="mt-1 truncate font-mono text-xs text-muted" title={data.webhooks.yoco}>{data.webhooks.yoco}</p>
				{:else}
					<p class="font-medium">Webhook not registered yet</p>
					<p class="mt-0.5 text-muted">Yoco has no dashboard setting for this — Log-Book registers it for you with your key.</p>
				{/if}
				{#if data.state.yoco.configured}
					<Button type="submit" size="sm" variant={data.masked.yoco.webhookSecret ? 'ghost' : 'primary'} class="mt-2" formaction="?/yocoWebhook" formnovalidate data-testid="yoco-register">
						{data.masked.yoco.webhookSecret ? 'Register again' : 'Register webhook'}
					</Button>
				{/if}
			</div>
			<div class="rounded-xl border border-border px-3">
				<Switch name="enabled" label="Offer Yoco" description="Live keys need your website domain verified in the Yoco App." checked={data.state.yoco.enabled} />
			</div>
			{@render footerButtons('yoco', data.state.yoco.configured ? 'Save Yoco' : 'Connect Yoco')}
		</form>
	</Card>

	<!-- PayFast -->
	<Card title="PayFast" description="Card, Instant EFT, Capitec Pay, SnapScan and more · South Africa (ZAR)." data-testid="card-payfast">
		{#snippet actions()}{@render badge('payfast')}{/snippet}
		<form method="POST" action="?/payfast" use:enhance={toastEnhance({ pending: pending('payfast-save'), reset: true })} class="space-y-4" autocomplete="off">
			<input type="hidden" name="provider" value="payfast" />
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Input label="Merchant ID" name="merchantId" inputmode="numeric" required value={data.masked.payfast.merchantId ?? ''} placeholder="10000100" />
				<Input
					label="Merchant key"
					name="merchantKey"
					type="password"
					autocomplete="new-password"
					placeholder={data.masked.payfast.merchantKey ?? 'Merchant key'}
					hint={data.masked.payfast.merchantKey ? 'Stored. Leave blank to keep it.' : undefined}
				/>
			</div>
			<Input
				label="Passphrase"
				name="passphrase"
				type="password"
				autocomplete="new-password"
				placeholder={data.masked.payfast.passphrase ?? 'Passphrase'}
				hint={data.masked.payfast.passphrase ? 'Stored encrypted. Leave blank to keep it.' : 'Must match Settings → Security pass phrase in PayFast. Needed for Test connection.'}
			/>
			{@render webhook('payfast', 'Notify URL — sent with every payment automatically, nothing to paste.')}
			<div class="divide-y divide-border rounded-xl border border-border px-3">
				<Switch name="sandbox" label="Test mode (sandbox)" description="Use sandbox.payfast.co.za credentials. No real money moves." checked={data.masked.payfast.sandbox} />
				<Switch name="enabled" label="Offer PayFast" checked={data.state.payfast.enabled} />
			</div>
			{@render footerButtons('payfast', data.state.payfast.configured ? 'Save PayFast' : 'Connect PayFast')}
		</form>
	</Card>

	<!-- Stripe -->
	<Card title="Stripe" description="Cards worldwide with your own Stripe account · outside South Africa." data-testid="card-stripe">
		{#snippet actions()}{@render badge('stripe')}{/snippet}
		<form method="POST" action="?/stripe" use:enhance={toastEnhance({ pending: pending('stripe-save'), reset: true })} class="space-y-4" autocomplete="off">
			<input type="hidden" name="provider" value="stripe" />
			<Input
				label="Secret key"
				name="secretKey"
				type="password"
				autocomplete="new-password"
				placeholder={data.masked.stripe.secretKey ?? 'sk_test_… or sk_live_…'}
				hint={data.masked.stripe.secretKey ? 'Stored encrypted. Leave blank to keep it.' : 'Stripe Dashboard → Developers → API keys.'}
			/>
			{@render webhook(
				'stripe',
				'Stripe → Developers → Webhooks → Add endpoint with this URL. Events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired.'
			)}
			<Input
				label="Webhook signing secret"
				name="webhookSecret"
				type="password"
				autocomplete="new-password"
				placeholder={data.masked.stripe.webhookSecret ?? 'whsec_…'}
				hint={data.masked.stripe.webhookSecret ? 'Stored encrypted. Leave blank to keep it.' : 'Shown on the endpoint page after you add it.'}
			/>
			<div class="rounded-xl border border-border px-3">
				<Switch name="enabled" label="Offer Stripe" description="South African businesses can’t open Stripe accounts — use Paystack there." checked={data.state.stripe.enabled} />
			</div>
			{@render footerButtons('stripe', data.state.stripe.configured ? 'Save Stripe' : 'Connect Stripe')}
		</form>
	</Card>
</div>

{#if data.recent.length}
	<Card title="Recent online payments" class="mt-6" padded={false}>
		<ul class="divide-y divide-border text-sm" data-testid="recent-payments">
			{#each data.recent as p (p.id)}
				<li class="flex items-center gap-3 px-5 py-3">
					<span class="min-w-0 flex-1">
						<span class="block font-medium tabular-nums">{p.amount} <span class="font-normal text-muted">· {p.provider}</span></span>
						<span class="text-xs text-muted">{purposeLabel(p.purpose)} · {new Date(p.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
					</span>
					<Badge tone={recentTone(p.status)}>{p.status}</Badge>
				</li>
			{/each}
		</ul>
	</Card>
{/if}
