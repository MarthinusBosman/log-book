import { downloadJumper } from '#lib/server/import/export-web.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => downloadJumper(event, 'json');
