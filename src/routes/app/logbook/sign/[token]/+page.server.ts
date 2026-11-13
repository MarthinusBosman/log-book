import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { users } from '#lib/server/db/schema.ts';
import { getJump, signJump } from '#lib/server/domain/logbook.ts';
import { decodeDataUrl, saveFile } from '#lib/server/domain/files.ts';
import { listRatings } from '#lib/server/domain/profile.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { domainFail, requireUser, str } from '#lib/server/jumper/forms.ts';
import { dzNameMap, jumpRow } from '#lib/server/jumper/logbook.ts';
import { parseSignToken, verifySignToken } from '#lib/server/jumper/signoff.ts';
import type { Actions, PageServerLoad } from './$types';

async function resolve(locals: App.Locals, token: string) {
	const t = parseSignToken(token);
	if (!t) return { state: 'invalid' as const };
	const jump = await getJump(locals.db, t.jumpId);
	if (!jump) return { state: 'invalid' as const };
	const owner = (await locals.db.select().from(users).where(eq(users.id, jump.userId)).limit(1))[0];
	if (!owner) return { state: 'invalid' as const };
	const check = await verifySignToken(owner, token);
	if (check !== 'ok') return { state: check };
	return { state: 'ok' as const, jump, owner };
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireUser(locals, url);
	const r = await resolve(locals, params.token);
	if (r.state !== 'ok') return { state: r.state };
	const me = (await locals.db.select({ name: users.name, licence: users.licence }).from(users).where(eq(users.id, user.id)).limit(1))[0];
	const ratings = await listRatings(locals.db, user.id);
	return {
		state: 'ok' as const,
		own: r.owner.id === user.id,
		ownerName: r.owner.name,
		jump: jumpRow(r.jump, await dzNameMap(locals.db, [r.jump])),
		me: { name: me.name, licence: me.licence, licensed: !!me.licence?.trim() || ratings.length > 0 }
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const r = await resolve(locals, params.token);
		if (r.state !== 'ok') return fail(400, { message: r.state === 'expired' ? 'This sign-off link has expired. Ask for a new one.' : 'This sign-off link is not valid.' });
		const form = await request.formData();
		if (!form.get('confirm')) return fail(400, { message: 'Tick the box to confirm you witnessed or supervised this jump.' });
		try {
			if (r.jump.signedAt) {
				// already signed: the domain returns it unchanged for the same signer, refuses anyone else (no file saved)
				await signJump(locals.db, { jumpId: r.jump.id, signerUserId: user.id });
				return { success: 'Jump has been signed' };
			}
			let signatureFileId: string | null = null;
			const sig = str(form, 'signature');
			if (sig) {
				const { data, mime } = decodeDataUrl(sig);
				if (mime !== 'image/png') return fail(400, { message: 'Signature must be a PNG image.' });
				signatureFileId = (await saveFile(locals.db, await getStorage(), { data, mime, purpose: 'signature', ownerUserId: user.id })).id;
			}
			await signJump(locals.db, { jumpId: r.jump.id, signerUserId: user.id, signatureFileId });
		} catch (e) {
			return domainFail(e);
		}
		return { success: 'Jump has been signed' };
	}
};
