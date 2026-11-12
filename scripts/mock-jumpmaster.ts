/**
 * Local stand-in for the Jump Master (Firebase Auth + Firestore REST) endpoints, serving the test
 * fixtures. For browser demos and e2e tests of the "Connect Jump Master account" card only — the
 * real service is never contacted.
 *
 *   PORT=4425 bun scripts/mock-jumpmaster.ts
 *   # then run the app with
 *   JUMPMASTER_FIREBASE_PROJECT_ID=mock-project JUMPMASTER_FIREBASE_API_KEY=mock-key \
 *   JUMPMASTER_AUTH_BASE_URL=http://localhost:4425 JUMPMASTER_FIRESTORE_BASE_URL=http://localhost:4425 ...
 *
 * Accounts: jo.jumper@example.com / jm-secret-1 (jumper), owner@jm-only.example / jm-secret-2 (DZ owner).
 */
import { createMockJumpMaster } from '../src/lib/server/import/mock-jumpmaster.ts';
import { docStore, dropzoneDocs, jumperDocs, OWNER_UID, UID } from '../src/lib/server/import/fixtures.ts';

const port = Number(process.env.PORT ?? 4425);
const mock = createMockJumpMaster({
	projectId: process.env.MOCK_PROJECT_ID ?? 'mock-project',
	apiKey: process.env.MOCK_API_KEY ?? 'mock-key',
	accounts: [
		{ email: 'jo.jumper@example.com', password: 'jm-secret-1', uid: UID },
		{ email: 'owner@jm-only.example', password: 'jm-secret-2', uid: OWNER_UID }
	],
	store: docStore(jumperDocs(), dropzoneDocs())
});

Bun.serve({ port, fetch: (req) => mock.handle(req) });
console.log(`mock Jump Master listening on http://localhost:${port}`);
