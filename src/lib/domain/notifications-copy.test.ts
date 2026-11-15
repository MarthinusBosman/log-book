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

	test('top-up outcomes link to that dropzone wallet and cope with a missing amount', () => {
		expect(renderNotification('topup_paid', { dropzoneName: 'Skydive Demo', dropzoneSlug: 'demo', amount: 'R 500.00' })).toEqual({
			title: 'Wallet topped up',
			body: 'Your R 500.00 top-up at Skydive Demo is paid and in your wallet.',
			href: '/app/wallet/demo'
		});
		expect(renderNotification('topup_paid', {}).body).toBe('Your top-up at the dropzone is paid and in your wallet.');
		expect(renderNotification('topup_declined', { dropzoneName: 'Skydive Demo', amount: 'R 10.00' })).toEqual({
			title: 'Top-up declined',
			body: 'Skydive Demo declined your R 10.00 top-up request. Nothing was added to your wallet.',
			href: '/app/wallet'
		});
		expect(renderNotification('topup_declined', {}).body).toBe('The dropzone declined your top-up request. Nothing was added to your wallet.');
	});
});
