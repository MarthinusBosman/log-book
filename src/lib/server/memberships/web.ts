/**
 * Route glue for the "Verify with PASA" card (profile) and the staff confirmation (jumper detail),
 * so the pages only spread these actions and pass the view-models through.
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import type { Database } from '../db/index.ts';
import type { MembershipCheck } from '../db/schema.ts';
import { domainFail } from '../jumper/forms.ts';
import { connectMembership, disconnectMembership, getMembershipCheck, lookupMembership, type LookupView } from './service.ts';

export type PasaCheckVM = {
	status: MembershipCheck['status'];
	number: string;
	memberName: string | null;
	licence: string | null;
	dropzone: string | null;
	ratings: { rating: string; value: string | null }[];
	current: boolean;
	expiry: string | null;
	checkedAt: number;
	reviewedAt: number | null;
};

export function toCheckVM(c: MembershipCheck | null): PasaCheckVM | null {
	if (!c) return null;
	return {
		status: c.status,
		number: c.number,
		memberName: c.memberName,
		licence: c.licence,
		dropzone: c.dropzone,
		ratings: c.ratings,
		current: c.current,
		expiry: c.expiry,
		checkedAt: c.checkedAt.getTime(),
		reviewedAt: c.reviewedAt?.getTime() ?? null
	};
}

export async function pasaCheckVM(db: Database, userId: string): Promise<PasaCheckVM | null> {
	return toCheckVM(await getMembershipCheck(db, userId));
}

const preview = (v: LookupView) => ({
	number: v.number,
	name: v.name,
	licence: v.licence,
	dropzone: v.dropzone,
	ratings: v.ratings,
	current: v.current,
	expiry: v.expiry,
	nameMatch: v.nameMatch
});

type Ev = Pick<RequestEvent, 'locals' | 'request'>;

const me = (e: Ev) => {
	const u = e.locals.user;
	if (!u) throw new Error('requireUser must run first');
	return u;
};

/** Form actions for the profile page (`...pasaActions`). Each returns `{ action: 'pasa', … }`. */
export const pasaActions = {
	pasaLookup: async (e: Ev) => {
		if (!e.locals.user) return fail(401, { action: 'pasa', message: 'Please log in again.' });
		const number = String((await e.request.formData()).get('number') ?? '');
		try {
			return { action: 'pasa', preview: preview(await lookupMembership(e.locals.db, me(e).id, { number })) };
		} catch (err) {
			return domainFail(err, { action: 'pasa' });
		}
	},
	pasaConnect: async (e: Ev) => {
		if (!e.locals.user) return fail(401, { action: 'pasa', message: 'Please log in again.' });
		const number = String((await e.request.formData()).get('number') ?? '');
		try {
			const r = await connectMembership(e.locals.db, me(e).id, { number });
			const success =
				r.status === 'verified'
					? 'PASA successfully connected'
					: r.status === 'lapsed'
						? 'Connected, but PASA lists your membership as expired'
						: 'Sent to your dropzone’s staff for confirmation';
			return { action: 'pasa', success };
		} catch (err) {
			return domainFail(err, { action: 'pasa' });
		}
	},
	pasaDisconnect: async (e: Ev) => {
		if (!e.locals.user) return fail(401, { action: 'pasa', message: 'Please log in again.' });
		await disconnectMembership(e.locals.db, me(e).id);
		return { action: 'pasa', success: 'PASA disconnected' };
	}
};
