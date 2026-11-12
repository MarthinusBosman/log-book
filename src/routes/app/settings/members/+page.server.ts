import { fail } from '@sveltejs/kit';
import { brand } from '#lib/brand.ts';
import { publicOrigin } from '#lib/server/config.ts';
import { getMailer } from '#lib/server/email/index.ts';
import { createPasswordResetToken } from '#lib/server/auth/users.ts';
import { listMembers, removeMember, setRoleColour } from '#lib/server/domain/dropzone-admin.ts';
import { grantRole, revokeRole } from '#lib/server/domain/permissions.ts';
import { inviteMember } from '#lib/server/domain/staff-admin.ts';
import { DROPZONE_ROLES, ROLE_LABELS, type DropzoneRole } from '#lib/domain/constants.ts';
import { optStr, requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import type { Actions, PageServerLoad } from './$types';

const parseRoles = (f: FormData) =>
	[...new Set(f.getAll('roles').map(String))].filter((r): r is DropzoneRole => (DROPZONE_ROLES as readonly string[]).includes(r));

const COLOUR_RE = /^#[0-9a-f]{6}$/i;

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'staff.manage');
	const members = await listMembers(event.locals.db, ctx.dz.id);
	return { members, me: ctx.user.id, isOwner: ctx.roles.includes('owner') };
};

export const actions: Actions = {
	invite: (event) =>
		runAction(event, 'staff.manage', async ({ dz, user, roles: myRoles }) => {
			const f = await event.request.formData();
			const roles = parseRoles(f);
			if (roles.includes('owner') && !myRoles.includes('owner')) return fail(403, { message: 'Only an owner can add another owner.' });
			const res = await inviteMember(event.locals.db, { dropzoneId: dz.id, email: str(f, 'email'), name: optStr(f, 'name'), roles, by: user.id });
			const origin = publicOrigin(event.url.origin);
			const roleText = roles.map((r) => ROLE_LABELS[r]).join(', ');
			if (res.created) {
				const token = await createPasswordResetToken(event.locals.db, res.userId);
				await getMailer().send({
					to: res.email,
					subject: `You're invited to ${dz.name} on ${brand.name}`,
					text: `Hi ${res.name},\n\n${user.name} added you to ${dz.name} as: ${roleText}.\n\nSet your password to get started (link valid for 1 hour — use "Forgot password" for a new one):\n${origin}/reset-password?token=${token}\n`
				});
				return { message: `Invite sent to ${res.email}` };
			}
			await getMailer().send({
				to: res.email,
				subject: `You've been added to ${dz.name}`,
				text: `Hi ${res.name},\n\n${user.name} added you to ${dz.name} as: ${roleText}.\n\n${origin}/app\n`
			});
			return { message: res.granted.length ? `${res.name} added` : `${res.name} already has those roles` };
		}),

	setRoles: (event) =>
		runAction(event, 'staff.manage', async ({ dz, user, roles: myRoles }) => {
			const f = await event.request.formData();
			const userId = str(f, 'userId');
			const member = (await listMembers(event.locals.db, dz.id)).find((m) => m.userId === userId);
			if (!member) return fail(404, { message: 'That person is no longer a member.' });
			const want = parseRoles(f);
			if (want.length === 0) want.push('jumper');
			const have = member.roles.map((r) => r.role);
			const add = want.filter((r) => !have.includes(r));
			const drop = have.filter((r) => !want.includes(r));
			if ([...add, ...drop].includes('owner') && !myRoles.includes('owner')) return fail(403, { message: 'Only an owner can change the owner role.' });
			if (userId === user.id && drop.some((r) => r === 'owner' || r === 'admin') && !want.includes('owner')) {
				return fail(400, { message: "You can't remove your own admin access. Ask another owner." });
			}
			const colour = str(f, 'colour');
			for (const role of add) {
				await grantRole(event.locals.db, {
					dropzoneId: dz.id,
					userId,
					role,
					colour: role === 'tandem_instructor' && COLOUR_RE.test(colour) ? colour : null,
					by: user.id,
					dropzoneName: dz.name
				});
			}
			for (const role of drop) await revokeRole(event.locals.db, dz.id, userId, role);
			if (want.includes('tandem_instructor') && COLOUR_RE.test(colour)) {
				await setRoleColour(event.locals.db, dz.id, userId, 'tandem_instructor', colour);
			}
			return { message: `Roles updated for ${member.name}` };
		}),

	remove: (event) =>
		runAction(event, 'staff.manage', async ({ dz, user, roles: myRoles }) => {
			const userId = str(await event.request.formData(), 'userId');
			if (userId === user.id) return fail(400, { message: "You can't remove yourself. Ask another owner." });
			const member = (await listMembers(event.locals.db, dz.id)).find((m) => m.userId === userId);
			if (!member) return fail(404, { message: 'That person is no longer a member.' });
			if (member.roles.some((r) => r.role === 'owner') && !myRoles.includes('owner')) return fail(403, { message: 'Only an owner can remove an owner.' });
			await removeMember(event.locals.db, dz.id, userId);
			return { message: `${member.name} removed from ${dz.name}` };
		})
};
