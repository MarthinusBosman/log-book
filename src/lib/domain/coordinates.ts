/**
 * Coordinates as owners actually have them: copied from Google Maps ("-33.0286, 18.1667"),
 * written with hemispheres ("33.0286° S, 18.1667° E") or as a map link. Client-safe.
 */
export type LatLng = { lat: number; lng: number };

const NUM = String.raw`[+-]?\d+(?:\.\d+)?`;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

function pair(lat: number, lng: number): LatLng | null {
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	return { lat: round(lat), lng: round(lng) };
}

/** Both coordinates from one pasted string or map link, or null when it isn't a pair. */
export function parseCoordinates(input: string): LatLng | null {
	let s = input.trim().replace(/[\u2212\u2012\u2013]/g, '-');
	if (!s) return null;
	if (/^https?:\/\//i.test(s) || s.includes('maps')) {
		try {
			s = decodeURIComponent(s);
		} catch {
			/* keep as is */
		}
		const patterns = [
			new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`), // Google place data (the pin itself)
			new RegExp(String.raw`[?&](?:q|query|ll|destination)=(?:loc:)?(${NUM})\s*,\s*(${NUM})`),
			new RegExp(String.raw`[?&]mlat=(${NUM})&mlon=(${NUM})`), // OpenStreetMap marker
			new RegExp(String.raw`@(${NUM}),(${NUM})`), // Google map centre
			new RegExp(String.raw`#map=\d+(?:\.\d+)?/(${NUM})/(${NUM})`) // OpenStreetMap view
		];
		for (const re of patterns) {
			const m = s.match(re);
			if (m) return pair(Number(m[1]), Number(m[2]));
		}
		return null;
	}
	const hemi = s.match(/^(\d+(?:\.\d+)?)\s*°?\s*([NS])\s*[,;]?\s*(\d+(?:\.\d+)?)\s*°?\s*([EW])$/i);
	if (hemi) {
		const lat = Number(hemi[1]) * (hemi[2].toUpperCase() === 'S' ? -1 : 1);
		const lng = Number(hemi[3]) * (hemi[4].toUpperCase() === 'W' ? -1 : 1);
		return pair(lat, lng);
	}
	const plain = s.match(new RegExp(String.raw`^(${NUM})(\s*[,;]\s*|\s+)(${NUM})$`));
	if (!plain) return null;
	// "-33,0286" is one number with a decimal comma, not a pair.
	if (plain[2] === ',' && !(plain[1].includes('.') && plain[3].includes('.'))) return null;
	return pair(Number(plain[1]), Number(plain[3]));
}

function oneNumber(raw: string): number | null | 'invalid' {
	const s = raw.trim().replace(/[\u2212\u2012\u2013]/g, '-');
	if (!s) return null;
	const n = Number(s.replace(',', '.'));
	return Number.isFinite(n) ? n : 'invalid';
}

/**
 * The settings form's Latitude/Longitude fields. A pair pasted into either field fills both
 * (works without JS); otherwise each field is one number (a decimal comma is accepted).
 */
export function readLatLng(latRaw: string, lngRaw: string): { lat: number | null; lng: number | null } | { error: string } {
	const pasted = parseCoordinates(latRaw) ?? (latRaw.trim() ? null : parseCoordinates(lngRaw));
	if (pasted) return pasted;
	const lat = oneNumber(latRaw);
	const lng = oneNumber(lngRaw);
	if (lat === 'invalid' || (lat !== null && Math.abs(lat) > 90)) return { error: 'Latitude must be between -90 and 90.' };
	if (lng === 'invalid' || (lng !== null && Math.abs(lng) > 180)) return { error: 'Longitude must be between -180 and 180.' };
	return { lat, lng };
}

/** OpenStreetMap link with a marker, so owners can check the pin. */
export function osmLink({ lat, lng }: LatLng): string {
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}
