/**
 * "Connect Jump Master account": runs in the user's browser. Signs in to the original app's
 * Firebase project with the user's own email/password (Firebase Auth REST), reads the documents
 * that user is allowed to read (Firestore REST), and returns them as `JmDocs`.
 *
 * The password only ever goes to the Firebase Auth endpoint — never to our server — and nothing
 * is stored. Project id / API key are the original's public web config, supplied by our server
 * from env vars (never hardcoded). Base URLs are injectable so tests run against a local mock.
 */
import { JM_DOCS_FORMAT, type JmDocs, type JmDropzoneDocs } from './map.ts';
import { decodeDocument, refPath, type FsDocument, type JmDoc } from './values.ts';

export type ConnectorConfig = {
	projectId: string;
	apiKey: string;
	authBaseUrl?: string;
	firestoreBaseUrl?: string;
	fetch?: typeof fetch;
};

export const DEFAULT_AUTH_BASE = 'https://identitytoolkit.googleapis.com';
export const DEFAULT_FIRESTORE_BASE = 'https://firestore.googleapis.com';

export const USER_SUBCOLLECTIONS = ['jumps', 'gear', 'jumperAccounts', 'ledgerEntries'] as const;
export const DROPZONE_SUBCOLLECTIONS = [
	'planes',
	'pricelist',
	'load',
	'slot',
	'tandems',
	'bookingSlots',
	'teams',
	'indemnityQuestions',
	'indemnityForms',
	'dzgear'
] as const;

export class ConnectorError extends Error {
	constructor(
		message: string,
		readonly code: 'auth' | 'network' | 'forbidden' | 'not_found' | 'unknown' = 'unknown'
	) {
		super(message);
	}
}

export type Progress = (step: string, detail?: { collection?: string; count?: number }) => void;

type Session = { idToken: string; uid: string; email: string };

const AUTH_MESSAGES: Record<string, string> = {
	EMAIL_NOT_FOUND: 'No Jump Master account uses that email.',
	INVALID_PASSWORD: 'Wrong password for that Jump Master account.',
	INVALID_LOGIN_CREDENTIALS: 'Wrong email or password for Jump Master.',
	USER_DISABLED: 'That Jump Master account is disabled.',
	TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Wait a few minutes and try again.'
};

export class JumpMasterConnector {
	private readonly f: typeof fetch;
	private readonly authBase: string;
	private readonly fsBase: string;
	private session: Session | null = null;

	constructor(private readonly cfg: ConnectorConfig) {
		if (!cfg.projectId || !cfg.apiKey) throw new ConnectorError('The Jump Master connector is not configured.');
		this.f = cfg.fetch ?? fetch.bind(globalThis);
		this.authBase = (cfg.authBaseUrl || DEFAULT_AUTH_BASE).replace(/\/$/, '');
		this.fsBase = (cfg.firestoreBaseUrl || DEFAULT_FIRESTORE_BASE).replace(/\/$/, '');
	}

	get uid() {
		return this.session?.uid ?? null;
	}

	private get root() {
		return `projects/${encodeURIComponent(this.cfg.projectId)}/databases/(default)/documents`;
	}

	/** Firebase Auth REST: accounts:signInWithPassword. The password is not kept. */
	async signIn(email: string, password: string): Promise<{ uid: string; email: string }> {
		let res: Response;
		try {
			res = await this.f(`${this.authBase}/v1/accounts:signInWithPassword?key=${encodeURIComponent(this.cfg.apiKey)}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, password, returnSecureToken: true })
			});
		} catch {
			throw new ConnectorError("Couldn't reach Jump Master. Check your connection.", 'network');
		}
		const body = (await res.json().catch(() => ({}))) as {
			idToken?: string;
			localId?: string;
			email?: string;
			error?: { message?: string };
		};
		if (!res.ok || !body.idToken || !body.localId) {
			const code = (body.error?.message ?? '').split(' ')[0];
			throw new ConnectorError(AUTH_MESSAGES[code] ?? 'Jump Master sign-in failed.', 'auth');
		}
		this.session = { idToken: body.idToken, uid: body.localId, email: body.email ?? email };
		return { uid: body.localId, email: this.session.email };
	}

	signOut() {
		this.session = null;
	}

	private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
		if (!this.session) throw new ConnectorError('Sign in to Jump Master first.', 'auth');
		let res: Response;
		try {
			res = await this.f(url, {
				...init,
				headers: { ...(init.headers ?? {}), authorization: `Bearer ${this.session.idToken}`, 'content-type': 'application/json' }
			});
		} catch {
			throw new ConnectorError("Couldn't reach Jump Master. Check your connection.", 'network');
		}
		if (res.status === 403 || res.status === 401) throw new ConnectorError('Jump Master refused access to this data.', 'forbidden');
		if (res.status === 404) throw new ConnectorError('Not found in Jump Master.', 'not_found');
		if (!res.ok) throw new ConnectorError(`Jump Master returned ${res.status}.`, 'unknown');
		return (await res.json()) as T;
	}

	async getDocument(path: string): Promise<JmDoc | null> {
		try {
			const d = await this.call<FsDocument>(`${this.fsBase}/v1/${this.root}/${path}`);
			return decodeDocument(d);
		} catch (e) {
			if (e instanceof ConnectorError && e.code === 'not_found') return null;
			throw e;
		}
	}

	/** List a (sub)collection, following nextPageToken. */
	async listCollection(path: string, onPage?: (n: number) => void): Promise<JmDoc[]> {
		const out: JmDoc[] = [];
		let pageToken: string | undefined;
		for (let i = 0; i < 1000; i++) {
			const q = new URLSearchParams({ pageSize: '300' });
			if (pageToken) q.set('pageToken', pageToken);
			const page = await this.call<{ documents?: FsDocument[]; nextPageToken?: string }>(
				`${this.fsBase}/v1/${this.root}/${path}?${q}`
			);
			for (const d of page.documents ?? []) out.push(decodeDocument(d));
			onPage?.(out.length);
			pageToken = page.nextPageToken;
			if (!pageToken) break;
		}
		return out;
	}

	/** Dropzones whose `owner` is the signed-in user (runQuery). */
	async findOwnedDropzones(): Promise<JmDoc[]> {
		if (!this.session) throw new ConnectorError('Sign in to Jump Master first.', 'auth');
		const rows = await this.call<{ document?: FsDocument }[]>(`${this.fsBase}/v1/${this.root}:runQuery`, {
			method: 'POST',
			body: JSON.stringify({
				structuredQuery: {
					from: [{ collectionId: 'dropzones' }],
					where: {
						fieldFilter: {
							field: { fieldPath: 'owner' },
							op: 'EQUAL',
							value: { referenceValue: `${this.root}/users/${this.session.uid}` }
						}
					},
					limit: 20
				}
			})
		});
		return rows.filter((r) => r.document).map((r) => decodeDocument(r.document!));
	}

	/** batchGet for referenced user docs; missing/forbidden docs are skipped. */
	async getUsers(paths: string[]): Promise<JmDoc[]> {
		const out: JmDoc[] = [];
		for (let i = 0; i < paths.length; i += 100) {
			const chunk = paths.slice(i, i + 100).map((p) => `${this.root}/${p}`);
			try {
				const rows = await this.call<{ found?: FsDocument; missing?: string }[]>(
					`${this.fsBase}/v1/${this.root}:batchGet`,
					{ method: 'POST', body: JSON.stringify({ documents: chunk }) }
				);
				for (const r of rows) if (r.found) out.push(decodeDocument(r.found));
			} catch (e) {
				if (!(e instanceof ConnectorError && e.code === 'forbidden')) throw e;
			}
		}
		return out;
	}

	/** The signed-in jumper's own data. */
	async fetchJumper(progress?: Progress): Promise<JmDocs> {
		const uid = this.session?.uid;
		if (!uid) throw new ConnectorError('Sign in to Jump Master first.', 'auth');
		progress?.('profile');
		const user = await this.getDocument(`users/${uid}`);
		if (!user) throw new ConnectorError('Your Jump Master profile could not be read.', 'not_found');
		const docs: JmDocs = { format: JM_DOCS_FORMAT, version: 1, exportedAt: new Date().toISOString(), uid, user };
		for (const c of USER_SUBCOLLECTIONS) {
			progress?.('collection', { collection: c, count: 0 });
			try {
				docs[c] = await this.listCollection(`users/${uid}/${c}`, (n) => progress?.('collection', { collection: c, count: n }));
			} catch (e) {
				if (e instanceof ConnectorError && e.code === 'forbidden') {
					docs[c] = [];
					progress?.('skipped', { collection: c });
				} else throw e;
			}
		}
		return docs;
	}

	/** A dropzone the signed-in user owns: dropzone doc + sub-lists + referenced user docs. */
	async fetchDropzone(dropzoneId: string, progress?: Progress): Promise<JmDocs> {
		const dz = await this.getDocument(`dropzones/${dropzoneId}`);
		if (!dz) throw new ConnectorError('Dropzone not found in Jump Master.', 'not_found');
		const full: JmDropzoneDocs = { ...dz };
		for (const c of DROPZONE_SUBCOLLECTIONS) {
			progress?.('collection', { collection: c, count: 0 });
			try {
				full[c] = await this.listCollection(`dropzones/${dropzoneId}/${c}`, (n) =>
					progress?.('collection', { collection: c, count: n })
				);
			} catch (e) {
				if (e instanceof ConnectorError && e.code === 'forbidden') {
					full[c] = [];
					progress?.('skipped', { collection: c });
				} else throw e;
			}
		}
		const refs = new Set<string>();
		const addRef = (v: unknown) => {
			const p = refPath(v);
			if (p?.startsWith('users/')) refs.add(p);
		};
		addRef(dz.owner);
		for (const f of ['manager', 'staff_members', 'riggers', 'tandemInstructors', 'tandemVideos', 'pilots', 'user_followers']) {
			if (Array.isArray(dz[f])) (dz[f] as unknown[]).forEach(addRef);
		}
		if (Array.isArray(dz.tandem_instructors_list)) {
			for (const t of dz.tandem_instructors_list as Record<string, unknown>[]) addRef(t?.user);
		}
		for (const s of full.slot ?? []) addRef(s.user);
		for (const t of full.teams ?? []) {
			addRef(t.coach);
			addRef(t.video);
			if (Array.isArray(t.users)) t.users.forEach(addRef);
		}
		progress?.('people', { count: refs.size });
		const users = await this.getUsers([...refs]);
		return { format: JM_DOCS_FORMAT, version: 1, exportedAt: new Date().toISOString(), uid: this.session?.uid, dropzone: full, users };
	}
}
