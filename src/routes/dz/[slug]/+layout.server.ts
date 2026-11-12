import { publicDropzone, publicDzView } from '#lib/server/tandems/public.ts';
import { brandingView } from '#lib/server/branding.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const dz = await publicDropzone(locals.db, params.slug);
	const b = brandingView(dz);
	return { dz: publicDzView(dz), signedIn: !!locals.user, branding: { style: b.style, logoUrl: b.logoUrl } };
};
