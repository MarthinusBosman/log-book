import type { DropzoneRole } from '#lib/domain/constants.ts';

export type RoleLockCtx = {
	/** The signed-in person holds the owner role here. */
	isOwner: boolean;
	/** The dialog edits the signed-in person's own roles (false for invites). */
	isSelf: boolean;
	/** Roles the edited person holds now. */
	has: ReadonlySet<DropzoneRole>;
};

/**
 * Why a role box in the Members dialogs can't be changed, or null when it can. Mirrors the
 * setRoles/invite guards so staff see the rule before Save instead of a refusal after it.
 * A locked box the person already holds must still be posted (hidden input), since a
 * disabled checkbox isn't submitted and the server would read it as dropped.
 */
export function roleLock(role: DropzoneRole, ctx: RoleLockCtx): string | null {
	if (role === 'owner' && !ctx.isOwner) return 'Only an owner can change this.';
	if (!ctx.isSelf || !ctx.has.has(role)) return null;
	if (role === 'owner') return "You can't remove your own owner role. Ask another owner.";
	if (role === 'admin' && !ctx.isOwner) return "You can't remove your own admin access. Ask an owner.";
	return null;
}
