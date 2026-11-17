import { expect, test } from 'bun:test';
import { openDaysText, telHref } from './hours.ts';

test('openDaysText reads the opening days as a sentence in week order', () => {
	expect(openDaysText(['sun', 'wed', 'sat'])).toBe('Open Wednesday, Saturday and Sunday');
	expect(openDaysText(['sat', 'sun'])).toBe('Open Saturday and Sunday');
	expect(openDaysText(['fri'])).toBe('Open Friday');
	expect(openDaysText(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).toBe('Open every day');
	expect(openDaysText([])).toBe('Opening days not published');
	expect(openDaysText(['funday'])).toBe('Opening days not published');
});

test('telHref drops spaces and punctuation so every phone can dial it', () => {
	expect(telHref('+27 21 555 0123')).toBe('tel:+27215550123');
	expect(telHref(' (021) 555-0123 ')).toBe('tel:0215550123');
	expect(telHref('+1 555.010.9999 ext 12')).toBe('tel:+15550109999');
	expect(telHref('082 555 0123 x4')).toBe('tel:0825550123');
});
