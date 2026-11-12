import type { DropzoneRole } from './domain/constants.ts';

/** Shared (client-safe) shapes. */
export type Membership = {
	dropzone: { id: string; slug: string; name: string; country: string | null };
	/** All roles the user holds at this dropzone (many allowed). */
	roles: DropzoneRole[];
	/** Highest-precedence role, for display. */
	role: DropzoneRole;
};
