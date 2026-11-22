import { describe, expect, test } from 'bun:test';
import { osmLink, parseCoordinates, readLatLng } from './coordinates.ts';

describe('parseCoordinates', () => {
	test('pairs as Google Maps copies them', () => {
		expect(parseCoordinates('-33.0286, 18.1667')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(parseCoordinates('  -33.0286,18.1667 ')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(parseCoordinates('-33.0286 18.1667')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(parseCoordinates('\u221233.0286; 18.1667')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(parseCoordinates('-33.02861234567, 18.16671234567')).toEqual({ lat: -33.028612, lng: 18.166712 });
	});

	test('hemisphere notation', () => {
		expect(parseCoordinates('33.0286° S, 18.1667° E')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(parseCoordinates('40.7N 74.0W')).toEqual({ lat: 40.7, lng: -74 });
	});

	test('degrees, minutes, seconds as Google Maps / Earth / GPS apps show them', () => {
		expect(parseCoordinates(`33°57'55.4"S 22°27'24.1"E`)).toEqual({ lat: -33.965389, lng: 22.456694 });
		expect(parseCoordinates('33°57′55.4″S, 22°27′24.1″E')).toEqual({ lat: -33.965389, lng: 22.456694 });
		expect(parseCoordinates(`S 33° 57.923' E 22° 27.402'`)).toEqual({ lat: -33.965383, lng: 22.4567 });
		expect(parseCoordinates(`40º 42' 46'' N 74º 0' 21'' W`)).toEqual({ lat: 40.712778, lng: -74.005833 });
		// Longitude first is fine when the letters say so
		expect(parseCoordinates('22.4567° E, 33.9654° S')).toEqual({ lat: -33.9654, lng: 22.4567 });
		// Two latitudes, minutes/seconds out of range, missing hemisphere
		expect(parseCoordinates('33.1 S, 18.1 N')).toBeNull();
		expect(parseCoordinates(`33°61'0"S 22°27'24"E`)).toBeNull();
		expect(parseCoordinates(`33°57'55"S 22°27'24"`)).toBeNull();
	});

	test('geo: links (Android share)', () => {
		expect(parseCoordinates('geo:-33.9654,22.4567?z=15')).toEqual({ lat: -33.9654, lng: 22.4567 });
	});

	test('map links', () => {
		expect(parseCoordinates('https://www.google.com/maps/@-33.0286,18.1667,15z')).toEqual({ lat: -33.0286, lng: 18.1667 });
		// The place pin (!3d/!4d) wins over the map centre (@).
		expect(
			parseCoordinates('https://www.google.com/maps/place/Skydive/@-33.1,18.2,14z/data=!3m1!4b1!4m6!3m5!3d-33.0286!4d18.1667')
		).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(parseCoordinates('https://maps.google.com/?q=-33.0286%2C18.1667')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(parseCoordinates('https://www.openstreetmap.org/?mlat=-33.0286&mlon=18.1667#map=15/-33.0286/18.1667')).toEqual({
			lat: -33.0286,
			lng: 18.1667
		});
		expect(parseCoordinates('https://www.openstreetmap.org/#map=12/-33.0286/18.1667')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(parseCoordinates('https://maps.app.goo.gl/AbCdEf123')).toBeNull();
	});

	test('single numbers and nonsense are not pairs', () => {
		expect(parseCoordinates('-33.0286')).toBeNull();
		expect(parseCoordinates('-33,0286')).toBeNull(); // decimal comma
		expect(parseCoordinates('-33,5')).toBeNull();
		expect(parseCoordinates('')).toBeNull();
		expect(parseCoordinates('Robertson, Western Cape')).toBeNull();
		expect(parseCoordinates('95.0, 18.1')).toBeNull(); // out of range
		expect(parseCoordinates('-33.0, 190.0')).toBeNull();
	});
});

describe('readLatLng', () => {
	test('a pair in either field fills both', () => {
		expect(readLatLng('-33.0286, 18.1667', '')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(readLatLng('-33.0286, 18.1667', '5')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(readLatLng('', 'https://www.google.com/maps/@-33.0286,18.1667,15z')).toEqual({ lat: -33.0286, lng: 18.1667 });
	});

	test('separate numbers, decimal commas, blanks', () => {
		expect(readLatLng('-33.0286', '18.1667')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(readLatLng('-33,0286', '18,1667')).toEqual({ lat: -33.0286, lng: 18.1667 });
		expect(readLatLng('', '')).toEqual({ lat: null, lng: null });
	});

	test('one DMS value per field', () => {
		expect(readLatLng(`33°57'55.4"S`, `22°27'24.1"E`)).toEqual({ lat: -33.965389, lng: 22.456694 });
		expect(readLatLng(`22°27'24.1"E`, '')).toEqual({ error: 'Latitude must be between -90 and 90.' });
	});

	test('errors', () => {
		expect(readLatLng('abc', '18')).toEqual({ error: 'Latitude must be between -90 and 90.' });
		expect(readLatLng('91', '18')).toEqual({ error: 'Latitude must be between -90 and 90.' });
		expect(readLatLng('-33', '181')).toEqual({ error: 'Longitude must be between -180 and 180.' });
	});
});

test('osmLink', () => {
	expect(osmLink({ lat: -33.0286, lng: 18.1667 })).toBe('https://www.openstreetmap.org/?mlat=-33.0286&mlon=18.1667#map=15/-33.0286/18.1667');
});
