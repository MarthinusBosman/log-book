<script lang="ts">
	import { enhance } from '$app/forms';
	import { JUMP_TYPE_LABELS, SLOT_EXTRA_LABELS, formatMoney, type JumpType, type SlotExtra } from '#lib/domain/constants.ts';
	import { Button, cn, toast } from '#lib/ui/index.ts';
	import type { PriceTable } from '#lib/server/jumper/manifest.ts';
	import Chip from './Chip.svelte';
	import FormAlert from './FormAlert.svelte';
	import { walletShortfall, type JoinWallet } from './format.ts';

	type Team = { id: string; name: string; members: { id: string; name: string }[]; coach: boolean; video: boolean };
	type Props = {
		mode: 'solo' | 'team' | 'change';
		loadId: string;
		slotId?: string;
		types: readonly string[];
		extras: readonly string[];
		prices: PriceTable;
		currency: string;
		initialType?: string;
		initialExtras?: string[];
		teams?: Team[];
		wallet?: JoinWallet | null;
		/** Current slot total when changing (to show the difference). */
		currentTotal?: number;
		error?: string | null;
		ondone?: () => void;
	};
	let {
		mode,
		loadId,
		slotId,
		types,
		extras,
		prices,
		currency,
		initialType,
		initialExtras = [],
		teams = [],
		wallet = null,
		currentTotal,
		error,
		ondone
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let jumpType = $state(initialType ?? types[0]);
	// svelte-ignore state_referenced_locally
	let chosen = $state<string[]>([...initialExtras]);
	// svelte-ignore state_referenced_locally
	let teamId = $state(teams[0]?.id ?? '');
	const team = $derived(teams.find((t) => t.id === teamId));
	const allMembers = (id: string) => teams.find((t) => t.id === id)?.members.map((m) => m.id) ?? [];
	// Initialised (not set in an $effect) so the server render already has everyone ticked:
	// otherwise pre-hydration / no-JS the price reads "0 × …" and the submit stays disabled.
	// svelte-ignore state_referenced_locally
	let memberIds = $state<string[]>(allMembers(teams[0]?.id ?? ''));
	function pickTeam(id: string) {
		teamId = id;
		memberIds = allMembers(id);
	}
	let busy = $state(false);

	const base = $derived(prices.base[jumpType as JumpType] ?? 0);
	const extrasTotal = $derived(chosen.reduce((a, e) => a + (prices.extras[e as SlotExtra] ?? 0), 0));
	const each = $derived(base + extrasTotal);
	const people = $derived(mode === 'team' ? memberIds.length : 1);
	const total = $derived(each * people);
	const funds = $derived(walletShortfall(mode === 'team' ? null : wallet, total - (currentTotal ?? 0)));
	const short = $derived(funds.short);

	function toggleExtra(e: string, on: boolean) {
		chosen = on ? [...new Set([...chosen, e])] : chosen.filter((x) => x !== e);
	}
</script>

{#if mode === 'team' && teams.length === 0}
	<!-- Nothing to manifest yet: no jump type / price / disabled button, just the way to a team. -->
	<div class="space-y-3" data-testid="no-team">
		<p class="text-sm text-muted">You don’t have a team yet. Create one, add your teammates, then manifest together from here or from the team page.</p>
		<Button href="/app/team?new=1" variant="secondary" class="w-full sm:w-auto">Create a team</Button>
	</div>
{:else}
	<form
		method="POST"
		action="?/{mode === 'solo' ? 'join' : mode}"
		class="space-y-4"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				if (result.type === 'success') {
					toast.success(String((result.data as { success?: string })?.success ?? 'Done'));
					ondone?.();
				}
			};
		}}
	>
		<input type="hidden" name="loadId" value={loadId} />
		{#if slotId}<input type="hidden" name="slotId" value={slotId} />{/if}

		{#if mode === 'team'}
			{#if teams.length}
				<div class="flex flex-col gap-1.5">
					<label for="team-{loadId}" class="text-sm font-medium">Team</label>
					<select id="team-{loadId}" name="teamId" value={teamId} onchange={(e) => pickTeam(e.currentTarget.value)} class="h-11 rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
						{#each teams as t (t.id)}<option value={t.id}>{t.name} ({t.members.length})</option>{/each}
					</select>
				</div>
				{#if team}
					<fieldset class="min-w-0">
						<legend class="mb-2 text-sm font-medium">Team members jumping</legend>
						<div class="flex flex-wrap gap-2">
							{#each team.members as m (m.id)}
								<label class="relative inline-flex cursor-pointer select-none">
									<input type="checkbox" name="memberIds" value={m.id} bind:group={memberIds} class="peer sr-only" />
									<span class="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-muted transition-all peer-checked:border-primary/50 peer-checked:bg-primary/10 peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-ring">{m.name}</span>
								</label>
							{/each}
						</div>
					</fieldset>
					{#if team.coach || team.video}
						<label class="flex items-center gap-2 text-sm text-muted">
							<input type="checkbox" name="includeStaff" checked class="size-4 accent-[var(--dz-primary)]" />
							Bring the team’s {team.coach && team.video ? 'coach and video' : team.coach ? 'coach' : 'videographer'}
						</label>
					{/if}
				{/if}
			{/if}
		{/if}

		<fieldset class="min-w-0">
			<legend class="mb-2 text-sm font-medium">Jump type</legend>
			<div class="flex flex-wrap gap-2">
				{#each types as t (t)}
					<Chip type="radio" name="jumpType" value={t} checked={jumpType === t} onchange={() => (jumpType = t)}>
						{JUMP_TYPE_LABELS[t as JumpType] ?? t}
					</Chip>
				{/each}
			</div>
		</fieldset>

		{#if extras.length}
			<fieldset class="min-w-0">
				<legend class="mb-2 text-sm font-medium">Extras</legend>
				<div class="flex flex-wrap gap-2">
					{#each extras as e (e)}
						<Chip name="extras" value={e} checked={chosen.includes(e)} onchange={(ev) => toggleExtra(e, (ev.currentTarget as HTMLInputElement).checked)}>
							{SLOT_EXTRA_LABELS[e as SlotExtra] ?? e}
							<span class="text-xs text-subtle">+{formatMoney(prices.extras[e as SlotExtra] ?? 0, currency)}</span>
						</Chip>
					{/each}
				</div>
			</fieldset>
		{/if}

		<div class="flex flex-col gap-3 rounded-xl border border-border bg-surface-2/50 p-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="text-sm">
				<p class="text-muted">
					{mode === 'team' ? `${people} × ${formatMoney(each, currency)}` : mode === 'change' ? 'New price' : 'Your slot'}
				</p>
				<p class="text-xl font-semibold tracking-tight tabular-nums" data-testid="live-price">{formatMoney(total, currency)}</p>
				{#if wallet && mode !== 'team'}
					<p class={cn('text-xs', short ? 'text-danger' : 'text-muted')} data-testid="wallet-note">
						Wallet: {formatMoney(wallet.availableMinor, wallet.currency)} available{short
							? ' — not enough'
							: funds.overdraw
								? ' — your balance will go below zero'
								: ''}
						{#if short && wallet.topUpHref}
							· <a href={wallet.topUpHref} class="font-medium text-primary underline underline-offset-2">Top up</a>
						{/if}
					</p>
				{/if}
			</div>
			<Button type="submit" size="lg" loading={busy} disabled={mode === 'team' && memberIds.length === 0} class="w-full sm:w-auto">
				{mode === 'solo' ? 'Join this load' : mode === 'team' ? 'Join load now' : 'Save changes'}
			</Button>
		</div>
		<FormAlert message={error} />
	</form>
{/if}
