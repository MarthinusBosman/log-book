import { describe, expect, test } from 'bun:test';
import { decodeHtml, parseMemberDetails, parseMemberList, ratingName } from './parse.ts';
import { pasaExpiry, pasaProvider } from './provider.ts';
import { fixture } from '../testing.ts';


describe('PASA parsers (synthetic fixtures with the live markup)', () => {
	test('member details with ratings', () => {
		const m = parseMemberDetails(fixture('member-details.html'));
		expect(m).toEqual({
			number: '9001',
			name: 'Thandi van der Berg',
			licence: 'C9100',
			dropzone: 'Skydive Example Bay',
			ratings: [
				{ rating: 'PRO Rating', value: 'PRO99' },
				{ rating: 'AFF Instructor', value: 'AI99' },
				{ rating: 'Tandem', value: 'TM999 SG(E) ST(U) V(E)' },
				{ rating: 'Coach', value: 'CH999 C' },
				{ rating: 'Jumpmaster', value: 'JM999 B SL(U)' },
				{ rating: 'Instructor', value: 'I999(U)' }
			]
		});
	});

	test('member without ratings, entities decoded', () => {
		const m = parseMemberDetails(fixture('member-details-no-ratings.html'));
		expect(m?.name).toBe('Pieter O’Neil'.replace('’', "'"));
		expect(m?.ratings).toEqual([]);
		expect(m?.licence).toBe('A9200');
	});

	test('unknown number → Access Denied page → null', () => {
		expect(parseMemberDetails(fixture('access-denied.html'))).toBeNull();
		expect(parseMemberDetails('<html>maintenance</html>')).toBeNull();
	});

	test('members list → PASA numbers', () => {
		const nums = parseMemberList(fixture('member-list.html'));
		expect(nums.length).toBe(61);
		expect(nums).toContain('9001');
		expect(nums).not.toContain('9002');
		expect(() => parseMemberList('<div>oops</div>')).toThrow();
		expect(() => parseMemberList(fixture('member-list.html'), 100)).toThrow(/incomplete/);
	});

	test('rating labels map to our names', () => {
		expect(ratingName('Senior Parachute Technician')).toBe('Senior Parachute Technician');
		expect(ratingName('PRO')).toBe('PRO Rating');
		expect(ratingName('Tandem Master Rating')).toBe('Tandem');
		expect(ratingName('Something New')).toBe('Something New');
		expect(decodeHtml('A &amp; B&nbsp;&#233;')).toBe('A & B é');
	});
});

describe('PASA provider', () => {
	test('number normalisation', () => {
		expect(pasaProvider.normaliseNumber(' 4568 ')).toBe('4568');
		expect(pasaProvider.normaliseNumber('PASA 0042')).toBe('42');
		expect(pasaProvider.normaliseNumber('PASA No. 77')).toBe('77');
		expect(pasaProvider.normaliseNumber('12a')).toBeNull();
		expect(pasaProvider.normaliseNumber('0')).toBeNull();
		expect(pasaProvider.normaliseNumber('')).toBeNull();
	});

	test('season expiry (31 March)', () => {
		expect(pasaExpiry(true, '2026-11-12')).toBe('2027-03-31');
		expect(pasaExpiry(true, '2027-03-31')).toBe('2027-03-31');
		expect(pasaExpiry(true, '2027-04-01')).toBe('2028-03-31');
		expect(pasaExpiry(false, '2026-11-12')).toBe('2026-03-31');
		expect(pasaExpiry(false, '2027-02-01')).toBe('2026-03-31');
	});

	test('fetchMember builds the public URL and rejects odd responses', async () => {
		const urls: string[] = [];
		const get = async (url: string) => {
			urls.push(url);
			return { status: 200, text: fixture('member-details.html') };
		};
		expect((await pasaProvider.fetchMember('9001', get))?.name).toBe('Thandi van der Berg');
		expect(urls[0]).toBe('https://www.para.co.za/Members/GetMemberViewDetails?PASANo=9001');
		await expect(pasaProvider.fetchMember('9003', get)).rejects.toThrow(/different member/);
		await expect(pasaProvider.fetchMember('9001', async () => ({ status: 503, text: '' }))).rejects.toThrow(/503/);
		await expect(pasaProvider.fetchMember('9001', async () => ({ status: 200, text: '<p>hi</p>' }))).rejects.toThrow(/Unexpected/);
		expect(await pasaProvider.fetchMember('9002', async () => ({ status: 200, text: fixture('access-denied.html') }))).toBeNull();
	});
});
