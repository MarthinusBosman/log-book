import { CSV_TEMPLATE } from '#lib/import/csv.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response(CSV_TEMPLATE, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="logbook-template.csv"'
		}
	});
