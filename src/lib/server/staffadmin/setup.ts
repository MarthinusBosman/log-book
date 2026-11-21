/**
 * "Set up your dropzone" checklist for owners/admins: derived from data that already exists, so it
 * needs no flags — each step ticks itself off once done and the card disappears when all are.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { aircraft, bookingSlots, dropzoneMemberRoles, indemnitySections, pricelistItems, tandemPassengers, type Dropzone } from '../db/schema.ts';
import { localDate } from '../domain/time.ts';

export type SetupStep = { id: string; title: string; body: string; href: string; done: boolean; optional?: boolean };

/** Show the card while a required step is open (the photo is nice-to-have). */
export const setupPending = (steps: SetupStep[]) => steps.some((s) => !s.done && !s.optional);

export async function setupChecklist(
	db: Database,
	dz: Pick<Dropzone, 'id' | 'slug' | 'description' | 'openDays' | 'photoFileId' | 'timezone' | 'lat' | 'lng'>,
	now: number = Date.now()
): Promise<SetupStep[]> {
	const today = localDate(now, dz.timezone);
	// One statement (a D1 round trip each otherwise): EXISTS per step.
	const has = (q: SQL) => sql<number>`exists(${q})`;
	const rows = await db
		.select({
			plane: has(sql`select 1 from ${aircraft} where ${aircraft.dropzoneId} = ${dz.id}`),
			prices: has(sql`select 1 from ${pricelistItems} where ${pricelistItems.dropzoneId} = ${dz.id} and ${pricelistItems.amountMinor} > 0`),
			staff: has(
				sql`select 1 from ${dropzoneMemberRoles} where ${dropzoneMemberRoles.dropzoneId} = ${dz.id} and ${dropzoneMemberRoles.role} not in ('owner', 'jumper')`
			),
			waiver: has(sql`select 1 from ${indemnitySections} where ${indemnitySections.dropzoneId} = ${dz.id}`),
			// Bookings are open while a weekly or upcoming slot exists. Once someone has booked a
			// slot online the step stays done, so an established DZ between seasons isn't nagged.
			slots: sql<number>`(${has(
				sql`select 1 from ${bookingSlots} where ${bookingSlots.dropzoneId} = ${dz.id} and (${bookingSlots.date} is null or ${bookingSlots.date} >= ${today})`
			)} or ${has(
				sql`select 1 from ${tandemPassengers} where ${tandemPassengers.dropzoneId} = ${dz.id} and ${tandemPassengers.bookingSlotId} is not null`
			)})`
		})
		.from(sql`(select 1)`);
	const r = rows[0];
	const [hasPlane, hasPrices, hasStaff, hasWaiver, hasSlots] = [r?.plane, r?.prices, r?.staff, r?.waiver, r?.slots].map((v) => Number(v) === 1);
	return [
		{ id: 'profile', title: 'Describe your dropzone', body: 'Description, opening days and hours.', href: '/app/settings', done: !!dz.description?.trim() && dz.openDays.length > 0 },
		{
			id: 'location',
			title: 'Pin your location',
			body: 'So jumpers nearby find you in the dropzone list.',
			href: '/app/settings#location',
			done: dz.lat != null && dz.lng != null
		},
		{ id: 'photo', title: 'Add a photo', body: 'Shown in the directory and on your booking page.', href: '/app/settings', done: !!dz.photoFileId, optional: true },
		{ id: 'aircraft', title: 'Add your aircraft', body: 'Capacity and weight limit for every load.', href: '/app/aircraft', done: hasPlane },
		{ id: 'prices', title: 'Set your prices', body: 'Manifest prices every slot from the pricelist.', href: '/app/pricelist', done: hasPrices },
		{ id: 'staff', title: 'Invite your staff', body: 'Manifest, instructors, pilots and riggers.', href: '/app/settings/members', done: hasStaff },
		{ id: 'waivers', title: 'Write your waivers', body: 'Tandem and sport-jumper indemnity forms.', href: '/app/waivers', done: hasWaiver },
		{ id: 'booking', title: 'Open tandem bookings', body: `Booking times for /dz/${dz.slug}.`, href: '/app/tandems/slots', done: hasSlots }
	];
}
