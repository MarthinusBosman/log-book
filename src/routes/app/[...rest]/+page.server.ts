import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Unknown /app/* URLs: a 404 rendered inside the app shell (sidebar + tabs stay usable). */
export const load: PageServerLoad = async () => {
	error(404, 'Not found');
};
