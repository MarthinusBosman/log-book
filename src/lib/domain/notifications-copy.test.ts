import { describe, expect, test } from 'bun:test';
import { notificationDay, renderNotification } from './constants.ts';

describe('notification copy', () => {
	test('pluralises loads and formats days', () => {
		expect(notificationDay('2026-11-11')).toBe('Wed 11 Nov');
		expect(notificationDay(undefined)).toBe('today');
		expect(renderNotification('new_loads', { dropzoneName: 'Skydive Demo', count: 1, day: '2026-11-11' }).body).toBe('Skydive Demo just opened 1 new load for Wed 11 Nov.');
		expect(renderNotification('new_loads', { dropzoneName: 'Skydive Demo', count: 3 }).body).toBe('Skydive Demo just opened 3 new loads for today.');
		expect(renderNotification('load_completed', { loadNumber: 4, day: '2026-11-11' }).body).toContain('Load 4 (Wed 11 Nov) is in your logbook');
	});
});
