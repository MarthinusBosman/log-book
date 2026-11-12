<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Input, Select, Icon } from '#lib/ui/index.ts';
	import Switch from '#lib/components/staffadmin/Switch.svelte';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let saving = $state(false);
	// svelte-ignore state_referenced_locally
	let wallet = $state(data.f.walletEnabled);
</script>

<svelte:head><title>Settings · Features</title></svelte:head>

<form method="POST" action="?/save" use:enhance={toastEnhance({ pending: (v) => (saving = v) })} class="grid gap-6 lg:grid-cols-2">
	<Card title="Payments & wallet" description="How jumpers pay for slots and tandems.">
		<div class="divide-y divide-border">
			<Switch name="paymentsOn" label="In-app payments" description="Card payments for sport jumpers and tandem bookings." checked={data.f.paymentsOn} />
			<Switch
				name="walletEnabled"
				label="Jumper wallet"
				description="Each jumper has a prepaid account here. Slots are held on manifest and charged when the load completes."
				bind:checked={wallet}
			/>
			<Switch
				name="walletAllowNegative"
				label="Allow negative balance"
				description="Manifest jumpers even when their wallet can't cover the slot."
				checked={data.f.walletAllowNegative}
				disabled={!wallet}
			/>
			<Switch
				name="staffPayToWallet"
				label="Pay staff into their wallet"
				description="Credit staff pay to the staff member's wallet when a load completes."
				checked={data.f.staffPayToWallet}
				disabled={!wallet}
			/>
			<Switch
				name="payAtManifest"
				label="Allow tandems to pay at manifest"
				description="Online bookings can skip payment and pay on the day."
				checked={data.f.payAtManifest}
			/>
		</div>
	</Card>

	<Card title="Jumpers & manifest" description="What jumpers can do themselves.">
		<div class="divide-y divide-border">
			<Switch name="selfManifest" label="Self-manifest" description="Jumpers can join open loads from their phone." checked={data.f.selfManifest} />
			<Switch name="requireCheckin" label="Require check-in" description="Only checked-in jumpers can be manifested." checked={data.f.requireCheckin} />
			<Switch name="indemnitySportActive" label="Sport jumper waiver" description="Jumpers must sign before they can join a load." checked={data.f.indemnitySportActive} />
			<Switch name="indemnityTandemActive" label="Tandem waiver" description="Tandem passengers sign during registration." checked={data.f.indemnityTandemActive} />
			<Switch name="emailNotices" label="Email notices" description="Send load calls and payment reminders by email too." checked={data.f.emailNotices} />
			<Switch name="listed" label="Listed in the dropzone directory" description="Jumpers can find and follow you." checked={data.f.listed} />
		</div>
	</Card>

	<Card title="Operations" description="Defaults for loads, logbooks and gear." class="lg:col-span-2">
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
			<Select
				label="Units"
				name="units"
				value={data.f.units}
				options={[
					{ value: 'metric', label: 'Metric (kg, m)' },
					{ value: 'imperial', label: 'Imperial (lb, ft)' }
				]}
			/>
			<Input label="Exit altitude (ft)" name="defaultAltitudeFt" type="number" min="1000" max="40000" step="500" value={data.f.defaultAltitudeFt ?? ''} placeholder="10000" />
			<Input label="Default load size" name="defaultCapacity" type="number" min="1" max="100" value={data.f.defaultCapacity ?? ''} placeholder="16" />
			<Input label="Gear warning (days)" name="gearWarnDays" type="number" min="1" max="365" value={data.f.gearWarnDays ?? ''} placeholder="30" />
			<Input label="Repack interval (days)" name="repackIntervalDays" type="number" min="30" max="730" value={data.f.repackIntervalDays ?? ''} placeholder="Country default" />
		</div>
	</Card>

	<div class="flex justify-end lg:col-span-2">
		<Button type="submit" loading={saving}><Icon name="check" class="size-4" /> Save features</Button>
	</div>
</form>
