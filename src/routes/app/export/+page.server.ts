import { exportSummary } from '#lib/server/import/export-web.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({ summary: await exportSummary(event) });
