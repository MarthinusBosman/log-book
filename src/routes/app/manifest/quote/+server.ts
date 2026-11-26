import { json, error } from '@sveltejs/kit';
import { computeSlotPrice, getPriceMap } from '#lib/server/domain/pricing.ts';
import { requireDropzone } from '#lib/server/manifest/context.ts';
import { JUMP_TYPES, SLOT_EXTRAS, SLOT_STAFF_ROLES, type JumpType, type SlotExtra, type SlotStaffRole } from '#lib/domain/constants.ts';
import { parseMoney } from '#lib/components/staffadmin/money.ts';
import type { RequestHandler } from './$types';

/** Live price preview for the add-slot form and slot editor: GET ?jumpType=belly&extras=gear_rental&extras=…&staffRole=&override=450&deposit=50000 */
export const GET: RequestHandler = async (event) => {
	const ctx = await requireDropzone(event, 'manifest');
	const q = event.url.searchParams;
	const jumpType = q.get('jumpType') ?? '';
	if (!(JUMP_TYPES as readonly string[]).includes(jumpType)) error(400, 'Unknown jump type');
	const extras = q.getAll('extras').filter((x): x is SlotExtra => (SLOT_EXTRAS as readonly string[]).includes(x));
	const role = q.get('staffRole') ?? '';
	const staffRole = (SLOT_STAFF_ROLES as readonly string[]).includes(role) ? (role as SlotStaffRole) : null;
	const ov = q.get('override');
	const baseOverrideMinor = ov ? parseMoney(ov) : null;
	// Slot editor: the deposit already paid on a tandem slot (minor units), as updateSlot keeps it.
	const dep = Number(q.get('deposit') ?? 0);
	const depositMinor = Number.isSafeInteger(dep) && dep > 0 ? dep : 0;
	const prices = await getPriceMap(event.locals.db, ctx.dz.id);
	const quote = computeSlotPrice({ prices, jumpType: jumpType as JumpType, extras, staffRole, baseOverrideMinor, depositMinor });
	// What "Gear rental" adds on top of this slot (for checked-in renters the panel adds it per jumper).
	const rentalMinor = extras.includes('gear_rental')
		? 0
		: computeSlotPrice({ prices, jumpType: jumpType as JumpType, extras: [...extras, 'gear_rental'], staffRole, baseOverrideMinor }).totalMinor -
			computeSlotPrice({ prices, jumpType: jumpType as JumpType, extras, staffRole, baseOverrideMinor }).totalMinor;
	return json({ ...quote, rentalMinor, currency: ctx.dz.currency }, { headers: { 'cache-control': 'private, max-age=30' } });
};
