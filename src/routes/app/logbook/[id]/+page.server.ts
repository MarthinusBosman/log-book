import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { users } from '#lib/server/db/schema.ts';
import { deleteJump, getJump, updateJump } from '#lib/server/domain/logbook.ts';
import { domainFail, requireUser } from '#lib/server/jumper/forms.ts';
import { dropzoneOptions, dzNameMap, jumpRow, parseJumpForm, rigOptions } from '#lib/server/jumper/logbook.ts';
import { createSignToken, qrSvg, SIGN_LINK_TTL_S } from '#lib/server/jumper/signoff.ts';
import type { Actions, PageServerLoad } from './$types';

async function ownJump(locals: App.Locals, userId: string, id: string) {
	const jump = await getJump(locals.db, id);
	if (!jump || jump.userId !== userId) error(404, 'Jump not found');
	return jump;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireUser(locals, url);
	const jump = await ownJump(locals, user.id, params.id);
	const [dropzones, rigs, names] = await Promise.all([dropzoneOptions(locals.db, user.id), rigOptions(locals.db, user.id), dzNameMap(locals.db, [jump])]);
	if (jump.dropzoneId && !dropzones.some((d) => d.id === jump.dropzoneId)) dropzones.push({ id: jump.dropzoneId, name: names.get(jump.dropzoneId) ?? 'Dropzone' });
	return {
		jump: jumpRow(jump, names),
		values: {
			jumpNumber: jump.jumpNumber,
			jumpDate: jump.jumpDate,
			dropzoneId: jump.dropzoneId,
			location: jump.location,
			aircraft: jump.aircraft,
			altitudeFt: jump.altitudeFt,
			freefallSeconds: jump.freefallSeconds,
			jumpType: jump.jumpType,
			description: jump.description,
			rigId: jump.rigId
		},
		dropzones,
		rigs,
		added: url.searchParams.has('added')
	};
};

export const actions: Actions = {
	update: async ({ locals, request, params }) => {
		const user = requireUser(locals);
		const jump = await ownJump(locals, user.id, params.id);
		const form = await request.formData();
		try {
			const allowed = new Set((await dropzoneOptions(locals.db, user.id)).map((d) => d.id));
			if (jump.dropzoneId) allowed.add(jump.dropzoneId);
			const input = parseJumpForm(form, allowed);
			if (input.rigId && !(await rigOptions(locals.db, user.id)).some((r) => r.id === input.rigId)) input.rigId = null;
			if (jump.verified) {
				// date, number, DZ and plane are locked on dropzone-verified jumps
				delete input.jumpNumber;
				delete (input as Partial<typeof input>).jumpDate;
				delete input.dropzoneId;
				delete input.aircraft;
				if (jump.dropzoneId) delete input.location;
			}
			await updateJump(locals.db, user.id, jump.id, input);
		} catch (e) {
			return domainFail(e, { action: 'update' });
		}
		return { action: 'update', success: 'Jump info updated' };
	},

	delete: async ({ locals, params }) => {
		const user = requireUser(locals);
		try {
			await deleteJump(locals.db, user.id, params.id);
		} catch (e) {
			return domainFail(e, { action: 'delete' });
		}
		redirect(303, '/app/logbook?deleted=1');
	},

	/** Create a signed sign-off link + QR for another licensed jumper to scan. */
	signlink: async ({ locals, params, url }) => {
		const user = requireUser(locals);
		const jump = await ownJump(locals, user.id, params.id);
		const owner = (await locals.db.select({ id: users.id, passwordHash: users.passwordHash, createdAt: users.createdAt }).from(users).where(eq(users.id, user.id)).limit(1))[0];
		if (!owner) return fail(400, { action: 'signlink', message: 'Account not found' });
		const token = await createSignToken(owner, jump.id);
		const link = `${url.origin}/app/logbook/sign/${token}`;
		return { action: 'signlink', link, qr: qrSvg(link, { title: `Sign jump ${jump.jumpNumber}` }), expiresInDays: SIGN_LINK_TTL_S / 86400 };
	}
};
