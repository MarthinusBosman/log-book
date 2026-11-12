import { describe, expect, test } from 'bun:test';
import { freshDb } from '../../domain/testing.ts';
import { discoverWebConfig, extractWebConfig } from './discover.ts';

// Shape of dart2js output for FirebaseOptions (synthetic values).
const FAKE_KEY = 'AIzaSyFAKEfakeFAKEfakeFAKEfakeFAKEfake00';
const JS = `var x=1;return A.m(A.aL_(A.cuQ("${FAKE_KEY}","1:123456789:web:abc123def456","demo-proj-1a2b.firebaseapp.com",null,null,"123456789","demo-proj-1a2b","demo-proj-1a2b.appspot.com")),$async$cif)`;

describe('Jump Master web config discovery', () => {
	test('extracts api key + project id from a Flutter web build', () => {
		expect(extractWebConfig(JS)).toEqual({ apiKey: FAKE_KEY, projectId: 'demo-proj-1a2b' });
		expect(extractWebConfig('nothing here')).toBeNull();
	});

	test('fetches once, caches the result, and caches misses briefly', async () => {
		const db = freshDb();
		let calls = 0;
		const ok = (async () => (calls++, new Response(JS))) as unknown as typeof fetch;
		const now = 1_800_000_000_000;
		expect(await discoverWebConfig(db, { fetch: ok, now })).toEqual({ apiKey: FAKE_KEY, projectId: 'demo-proj-1a2b' });
		expect(await discoverWebConfig(db, { fetch: ok, now: now + 3_600_000 })).not.toBeNull();
		expect(calls).toBe(1);

		const db2 = freshDb();
		let calls2 = 0;
		const down = (async () => (calls2++, new Response('nope', { status: 503 }))) as unknown as typeof fetch;
		expect(await discoverWebConfig(db2, { fetch: down, now })).toBeNull();
		expect(await discoverWebConfig(db2, { fetch: down, now: now + 60_000 })).toBeNull();
		expect(calls2).toBe(1); // miss cached
		expect(await discoverWebConfig(db2, { fetch: ok, now: now + 2 * 3_600_000 })).not.toBeNull();
	});
});
