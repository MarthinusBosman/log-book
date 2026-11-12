import type { PriceCode } from '#lib/domain/constants.ts';

export type PriceGroup = { id: string; title: string; description: string; hint?: string; codes: { code: PriceCode; help?: string }[] };

/** How the price list editor groups the codes (every PRICE_CODE appears exactly once — see test). */
export const PRICE_GROUPS: PriceGroup[] = [
	{
		id: 'sport',
		title: 'Sport jumps',
		description: 'Licensed jumpers. Base price per jump type, plus gear rental.',
		codes: [
			{ code: 'sport_slot', help: 'Belly, freefly, tracking, angle, wingsuit, CRW' },
			{ code: 'hop_pop', help: 'Low-altitude hop & pop' },
			{ code: 'gear_rental', help: 'Added per jump' }
		]
	},
	{
		id: 'altitude',
		title: 'Altitude',
		description: 'Added to the slot when the jumper picks a higher exit.',
		codes: [
			{ code: 'extra_altitude', help: 'Sport, per jump' },
			{ code: 'max_altitude', help: 'Sport, per jump' },
			{ code: 'tandem_extra_altitude', help: 'Tandem, per jump' },
			{ code: 'tandem_max_altitude', help: 'Tandem, per jump' }
		]
	},
	{
		id: 'students',
		title: 'Students & AFF',
		description: 'Per-jump prices for students in training.',
		codes: [
			{ code: 'static_line' },
			{ code: 'isp', help: 'Instructor-assisted / progression jump' },
			{ code: 'coach', help: 'Coached jump' },
			{ code: 'aff_1_3' },
			{ code: 'aff_4_7' },
			{ code: 'aff_8_10' }
		]
	},
	{
		id: 'courses',
		title: 'Courses',
		description: 'Price for the complete course.',
		codes: [{ code: 'static_line_course' }, { code: 'aff_course' }]
	},
	{
		id: 'tandem',
		title: 'Tandem & extras',
		description: 'Jump only, plus optional extras added per passenger.',
		codes: [{ code: 'tandem_slot', help: 'Jump only' }, { code: 'tandem_extreme_ride' }, { code: 'tandem_beach_landing' }]
	},
	{
		id: 'media',
		title: 'Media',
		description: 'Tandem photo & video packages.',
		codes: [{ code: 'tandem_handcam' }, { code: 'tandem_outside_video' }]
	},
	{
		id: 'event',
		title: 'Special event',
		description: 'Surcharge for boogies and special loads.',
		codes: [{ code: 'special_event', help: 'Added per jump' }]
	},
	{
		id: 'deposit',
		title: 'Deposit',
		description: 'Taken when a tandem books online and deducted from the balance on the day.',
		codes: [{ code: 'tandem_deposit', help: 'Non-refundable, per booked jumper' }]
	},
	{
		id: 'staff_pay',
		title: 'Staff pay',
		description: 'What staff earn. Written onto each staff slot and summed on the Staff page.',
		codes: [
			{ code: 'pay_tandem' },
			{ code: 'pay_tandem_video' },
			{ code: 'pay_handcam', help: 'On top of the TI rate when the passenger has handcam' },
			{ code: 'pay_aff' },
			{ code: 'pay_coach' },
			{ code: 'pay_pilot' }
		]
	}
];
