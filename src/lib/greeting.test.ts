import { describe, expect, test } from 'bun:test';
import { emailHi, timeGreeting } from './greeting.ts';

describe('timeGreeting', () => {
	test('neutral before dawn and without a timezone', () => {
		expect(timeGreeting(null)).toBe('Welcome');
		expect(timeGreeting(0)).toBe('Hello');
		expect(timeGreeting(4)).toBe('Hello');
	});
	test('morning, afternoon, evening', () => {
		expect(timeGreeting(5)).toBe('Good morning');
		expect(timeGreeting(11)).toBe('Good morning');
		expect(timeGreeting(12)).toBe('Good afternoon');
		expect(timeGreeting(17)).toBe('Good afternoon');
		expect(timeGreeting(18)).toBe('Good evening');
		expect(timeGreeting(23)).toBe('Good evening');
	});
});

describe('emailHi', () => {
	test('uses a real name', () => {
		expect(emailHi('Pete Pilot', 'pete.pilot@example.com')).toBe('Hi Pete Pilot,');
		expect(emailHi('Pete', null)).toBe('Hi Pete,');
	});
	test('drops the placeholder name taken from the email address', () => {
		expect(emailHi('pete.pilot', 'pete.pilot@example.com')).toBe('Hi,');
		expect(emailHi('Pete.Pilot', 'pete.pilot@example.com')).toBe('Hi,');
		expect(emailHi('  ', 'a@b.c')).toBe('Hi,');
		expect(emailHi(null)).toBe('Hi,');
	});
});
