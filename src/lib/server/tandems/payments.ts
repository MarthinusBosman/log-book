/**
 * Booking payment options for the public tandem booking flow.
 *   - "Pay at the dropzone" (manual): when online payments are off, the DZ allows pay-at-manifest,
 *     or no online provider is ready (so booking never dead-ends).
 *   - Online: every provider the dropzone has connected and enabled (its own merchant account).
 */
import type { Database } from '../db/index.ts';
import type { Dropzone } from '../db/schema.ts';
import { dropzonePayments, providerChoices, type OnlineProviderId } from '../payments/index.ts';

export const MANUAL_OPTION = {
	id: 'manual' as const,
	label: 'Pay at the dropzone',
	description: 'Reserve now and pay at check-in on the day (cash, card or EFT).'
};

export type BookingOption = { id: 'manual' | OnlineProviderId; label: string; description: string };

export async function bookingOptions(db: Database, dz: Dropzone, secretsKey: string): Promise<{ options: BookingOption[]; online: OnlineProviderId[]; manual: boolean }> {
	const { usable } = await dropzonePayments(db, dz, secretsKey);
	const manual = !dz.paymentsOn || dz.payAtManifest || usable.length === 0;
	return { options: [...providerChoices(usable), ...(manual ? [MANUAL_OPTION] : [])], online: usable, manual };
}
