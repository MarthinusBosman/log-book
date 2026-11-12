/**
 * Logbook sign-off links: `/app/logbook/sign/<token>` where
 *   token = <jumpId>.<expiresAtSeconds>.<hmac-sha256 hex, first 32 chars>
 * The HMAC key is derived from the jump owner's secret server-side material (password hash + id),
 * so links can't be forged, need no extra table/env var, and stop working if the owner changes
 * their password. Opening a link still requires a logged-in, licensed signer (domain `signJump`).
 */
import qrcode from 'qrcode-generator';

export const SIGN_LINK_TTL_S = 7 * 24 * 3600;

const enc = new TextEncoder();

async function hmacHex(keyMaterial: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', enc.encode(keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
	return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type SignKeyOwner = { id: string; passwordHash: string | null; createdAt: Date };

function keyFor(owner: SignKeyOwner): string {
	return `logbook-sign:v1:${owner.id}:${owner.passwordHash ?? ''}:${owner.createdAt.getTime()}`;
}

export async function createSignToken(owner: SignKeyOwner, jumpId: string, now = Date.now(), ttlS = SIGN_LINK_TTL_S): Promise<string> {
	const exp = Math.floor(now / 1000) + ttlS;
	const sig = (await hmacHex(keyFor(owner), `${jumpId}.${exp}`)).slice(0, 32);
	return `${jumpId}.${exp}.${sig}`;
}

/** Split a token without verifying it (to look up the jump + owner). */
export function parseSignToken(token: string): { jumpId: string; exp: number; sig: string } | null {
	const m = /^([0-9a-f-]{8,64})\.(\d{9,12})\.([0-9a-f]{32})$/i.exec(token);
	return m ? { jumpId: m[1], exp: Number(m[2]), sig: m[3].toLowerCase() } : null;
}

export type TokenCheck = 'ok' | 'invalid' | 'expired';

export async function verifySignToken(owner: SignKeyOwner, token: string, now = Date.now()): Promise<TokenCheck> {
	const t = parseSignToken(token);
	if (!t) return 'invalid';
	const expected = (await hmacHex(keyFor(owner), `${t.jumpId}.${t.exp}`)).slice(0, 32);
	let diff = expected.length ^ t.sig.length;
	for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (t.sig.charCodeAt(i) || 0);
	if (diff !== 0) return 'invalid';
	return t.exp * 1000 < now ? 'expired' : 'ok';
}

/** Server-rendered QR code as an inline SVG string (currentColor modules, transparent background). */
export function qrSvg(text: string, opts: { margin?: number; title?: string } = {}): string {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	const count = qr.getModuleCount();
	const margin = opts.margin ?? 2;
	const size = count + margin * 2;
	let path = '';
	for (let r = 0; r < count; r++) {
		for (let c = 0; c < count; c++) {
			if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
		}
	}
	const title = opts.title ? `<title>${opts.title.replace(/[<>&"]/g, '')}</title>` : '';
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img">${title}<path fill="currentColor" d="${path}"/></svg>`;
}
