<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import { Badge, Button, Card, toast } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import JumpForm from '#lib/components/jumper/JumpForm.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import { fmtDate, fmtDateTime } from '#lib/components/jumper/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const j = $derived(data.jump);
	const f = $derived(form as { action?: string; values?: typeof data.values; message?: string; success?: string; link?: string; qr?: string; expiresInDays?: number } | null);
	let busySign = $state(false);
	let copied = $state(false);

	onMount(() => {
		if (data.added) {
			toast.success('Jump has been added');
			history.replaceState(history.state, '', location.pathname);
		}
	});
	$effect(() => {
		const msg = f?.action === 'update' ? f.success : null;
		// untrack: toast.success reads its own queue, which would re-trigger this effect forever
		if (msg) untrack(() => toast.success(msg));
	});
	async function copy(link: string) {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error('Copy failed — select the link instead');
		}
	}
	async function share(link: string) {
		if (navigator.share) await navigator.share({ title: `Sign my jump #${j.jumpNumber}`, url: link }).catch(() => {});
		else copy(link);
	}
</script>

{#snippet deleteCard(cls: string)}
		{#if !j.verified}
			<Card class={cls}>
				<form
					method="POST"
					action="?/delete"
					use:enhance={(e) => {
						if (!confirm('Are you sure you want to delete this jump?')) return e.cancel();
					}}
				>
					<div class="flex items-center justify-between gap-3">
						<p class="text-sm text-muted">Remove this jump from your logbook.</p>
						<Button type="submit" variant="ghost" size="sm" class="text-danger hover:text-danger" data-testid="delete-jump"><JIcon name="trash" class="size-4" /> Delete</Button>
					</div>
				</form>
				<FormAlert class="mt-3" message={f?.action === 'delete' ? f.message : null} />
			</Card>
		{/if}
{/snippet}

<svelte:head><title>Jump #{j.jumpNumber}</title></svelte:head>

<PageHeader title="Jump #{j.jumpNumber}" description="{fmtDate(j.jumpDate)}{j.place ? ` · ${j.place}` : ''}" back={{ href: '/app/logbook', label: 'Logbook' }}>
	{#snippet actions()}
		{#if j.verified}<Badge tone="success"><JIcon name="badgeCheck" class="size-3.5" /> Verified by dropzone</Badge>{/if}
		{#if j.source === 'load'}<Badge tone="brand">Auto-logged from load</Badge>{:else if j.source === 'import'}<Badge>Imported</Badge>{/if}
	{/snippet}
</PageHeader>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
	<div class="lg:col-span-3">
		<Card title="Jump details" description={j.verified ? 'Logged by the dropzone when the load completed. Date, number, dropzone and aircraft are locked.' : undefined}>
			<JumpForm
				values={f?.action === 'update' && f.values ? f.values : data.values}
				dropzones={data.dropzones}
				rigs={data.rigs}
				locked={j.verified}
				action="?/update"
				submitLabel="Save changes"
				error={f?.action === 'update' ? f.message : null}
			/>
		</Card>
		{@render deleteCard('mt-4 lg:hidden')}
	</div>

	<aside class="order-first space-y-4 lg:order-none lg:col-span-2">
		<Card title="Sign-off">
			{#if j.signedAt}
				<div class="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4" data-testid="signed">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success"><JIcon name="badgeCheck" class="size-5" /></span>
					<div class="min-w-0 text-sm">
						<p class="font-semibold">Signed by {j.signerName}</p>
						<p class="text-muted">{j.signerLicence ? `Licence ${j.signerLicence} · ` : ''}{fmtDateTime(j.signedAt)}</p>
						{#if j.signatureUrl}
							<img src={j.signatureUrl} alt="Signature of {j.signerName}" class="mt-2 h-14 max-w-full rounded-lg bg-white object-contain p-1" data-testid="signature-img" />
						{/if}
					</div>
				</div>
				<p class="mt-3 text-xs text-muted">Changing the date, place, plane, altitude, freefall or type clears the signature.</p>
			{:else if f?.action === 'signlink' && f.link}
				<div class="space-y-4" data-testid="sign-link">
					<div class="mx-auto w-full max-w-56 rounded-2xl bg-white p-3 text-black shadow-sm">{@html f.qr}</div>
					<p class="text-center text-sm text-muted">Ask an instructor or licensed jumper to scan this and sign while logged in. Valid for {f.expiresInDays} days.</p>
					<div class="flex items-center gap-2 rounded-xl border border-border bg-surface-2/50 p-2">
						<input readonly value={f.link} class="min-w-0 flex-1 bg-transparent px-1 font-mono text-xs text-muted outline-none" onfocus={(e) => e.currentTarget.select()} aria-label="Sign-off link" />
						<Button size="sm" variant="secondary" onclick={() => copy(f.link!)}>{copied ? 'Copied' : 'Copy'}</Button>
					</div>
					<Button variant="outline" class="w-full" onclick={() => share(f.link!)}><JIcon name="link" class="size-4" /> Share link</Button>
				</div>
			{:else}
				<p class="text-sm text-muted">Get this jump signed by an instructor or another licensed jumper. They scan a QR code or open a link and sign with their own account — their name and licence are recorded.</p>
				<form method="POST" action="?/signlink" class="mt-4" use:enhance={() => { busySign = true; return async ({ update }) => { await update({ reset: false }); busySign = false; }; }}>
					<Button type="submit" class="w-full" loading={busySign} data-testid="create-sign-link"><JIcon name="qr" class="size-4" /> Get signed</Button>
				</form>
				<FormAlert class="mt-3" message={f?.action === 'signlink' ? f.message : null} />
			{/if}
		</Card>

		{@render deleteCard('hidden lg:block')}
	</aside>
</div>
