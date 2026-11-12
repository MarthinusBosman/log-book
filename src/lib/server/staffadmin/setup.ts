/**
 * "Set up your dropzone" checklist for owners/admins: derived from data that already exists, so it
 * needs no flags — each step ticks itself off once done and the card disappears when all are.
 */
import { and, eq, gt, ne, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { aircraft, bookingSlots, dropzoneMemberRoles, indemnitySections, pricelistItems, type Dropzone } from '../db/schema.ts';

export type SetupStep = { id: string; title: string; body: string; href: string; done: boolean; optional?: boolean };

const exists = async (db: Database, q: Promise<unknown[]>) => (await q).length > 0;

/** Show the card while a required step is open (the photo is nice-to-have). */
export const setupPending = (steps: SetupStep[]) => steps.some((s) => !s.done && !s.optional);

export async function setupChecklist(
	db: Database,
	dz: Pick<Dropzone, 'id' | 'slug' | 'description' | 'openDays' | 'photoFileId'>
): Promise<SetupStep[]> {
	const [hasPlane, hasPrices, hasStaff, hasWaiver, hasSlots] = await Promise.all([
		exists(db, db.select({ id: aircraft.id }).from(aircraft).where(eq(aircraft.dropzoneId, dz.id)).limit(1)),
		exists(db, db.select({ id: pricelistItems.id }).from(pricelistItems).where(and(eq(pricelistItems.dropzoneId, dz.id), gt(pricelistItems.amountMinor, 0))).limit(1)),
		exists(
			db,
			db
				.select({ n: sql<number>`1` })
				.from(dropzoneMemberRoles)
				.where(and(eq(dropzoneMemberRoles.dropzoneId, dz.id), ne(dropzoneMemberRoles.role, 'owner'), ne(dropzoneMemberRoles.role, 'jumper')))
				.limit(1)
		),
		exists(db, db.select({ id: indemnitySections.id }).from(indemnitySections).where(eq(indemnitySections.dropzoneId, dz.id)).limit(1)),
		exists(db, db.select({ id: bookingSlots.id }).from(bookingSlots).where(eq(bookingSlots.dropzoneId, dz.id)).limit(1))
	]);
	return [
		{ id: 'profile', title: 'Describe your dropzone', body: 'Description, opening days and hours.', href: '/app/settings', done: !!dz.description?.trim() && dz.openDays.length > 0 },
		{ id: 'photo', title: 'Add a photo', body: 'Shown in the directory and on your booking page.', href: '/app/settings', done: !!dz.photoFileId, optional: true },
		{ id: 'aircraft', title: 'Add your aircraft', body: 'Capacity and weight limit for every load.', href: '/app/aircraft', done: hasPlane },
		{ id: 'prices', title: 'Set your prices', body: 'Manifest prices every slot from the pricelist.', href: '/app/pricelist', done: hasPrices },
		{ id: 'staff', title: 'Invite your staff', body: 'Manifest, instructors, pilots and riggers.', href: '/app/settings/members', done: hasStaff },
		{ id: 'waivers', title: 'Write your waivers', body: 'Tandem and sport-jumper indemnity forms.', href: '/app/waivers', done: hasWaiver },
		{ id: 'booking', title: 'Open tandem bookings', body: `Booking times for /dz/${dz.slug}.`, href: '/app/tandems/slots', done: hasSlots }
	];
}
