/**
 * Small document renderer on pdf-lib (pure JS: works on Bun and Cloudflare Workers).
 * Used for signed waivers (sport + tandem) and tandem booking confirmations.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { IndemnityAnswer } from '../db/schema.ts';
import type { IndemnitySectionType } from '../../domain/constants.ts';

export type PdfField = [label: string, value: string | number | null | undefined];
export type PdfBlock = { title: string; fields: PdfField[] };
export type PdfSignature = { label: string; name: string; png?: Uint8Array | null };

export type DocumentPdfInput = {
	/** Big heading, e.g. "Skydive Indemnity – Tandem Skydive". */
	title: string;
	dropzoneName: string;
	/** Prominent reference (confirmation number). */
	highlight?: { label: string; value: string };
	blocks: PdfBlock[];
	/** Indemnity text that was signed (snapshot) and the signer's answers. */
	form?: { title: string; content: string; type: IndemnitySectionType }[];
	answers?: IndemnityAnswer[];
	/** Images for `signature` section answers, by file id. */
	answerImages?: Record<string, Uint8Array>;
	signatures?: PdfSignature[];
	signedAtText?: string | null;
	/** Integrity line printed under the signatures (hash of the signed record). */
	integrity?: string | null;
	footer: string;
	/** Dropzone branding: logo (PNG/JPEG; others skipped) and accent colour (#rrggbb). */
	logo?: { data: Uint8Array; mime: string } | null;
	accent?: string | null;
};

function hexRgb(hex: string | null | undefined) {
	const m = hex ? /^#([0-9a-f]{6})$/i.exec(hex) : null;
	if (!m) return null;
	const n = parseInt(m[1], 16);
	return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const A4: [number, number] = [595.28, 841.89];
const M = 48;
const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.38, 0.43, 0.52);
const LINE = rgb(0.86, 0.88, 0.92);
const DEFAULT_BRAND = rgb(0.118, 0.42, 1);

export async function renderDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.setTitle(`${input.title} – ${input.dropzoneName}`);
	doc.setProducer('pdf-lib');
	doc.setCreator(input.footer);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const W = A4[0] - 2 * M;

	let page: PDFPage = doc.addPage(A4);
	let y = A4[1] - M;
	const pages: PDFPage[] = [page];

	const newPage = () => {
		page = doc.addPage(A4);
		pages.push(page);
		y = A4[1] - M;
	};
	const ensure = (h: number) => {
		if (y - h < M + 24) newPage();
	};
	const safe = makeSanitizer(font);
	const safeBold = makeSanitizer(bold);
	const text = (s: string, x: number, size: number, f: PDFFont = font, color = INK) => {
		page.drawText(f === bold ? safeBold(s) : safe(s), { x, y, size, font: f, color });
	};
	const wrap = (s: string, size: number, width: number, f: PDFFont = font) => wrapText(f === bold ? safeBold(s) : safe(s), f, size, width);

	const BRAND = hexRgb(input.accent) ?? DEFAULT_BRAND;
	// header band
	page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: BRAND });
	if (input.logo?.data.length) {
		try {
			const img = input.logo.mime === 'image/png' ? await doc.embedPng(input.logo.data) : input.logo.mime === 'image/jpeg' ? await doc.embedJpg(input.logo.data) : null;
			if (img) {
				const s = Math.min(120 / img.width, 40 / img.height, 1);
				page.drawImage(img, { x: A4[0] - M - img.width * s, y: A4[1] - M - img.height * s + 12, width: img.width * s, height: img.height * s });
			}
		} catch {
			/* unreadable logo: render without it */
		}
	}
	text(input.dropzoneName.toUpperCase(), M, 9, bold, BRAND);
	y -= 24;
	for (const line of wrap(input.title, 20, W, bold)) {
		text(line, M, 20, bold);
		y -= 24;
	}
	if (input.highlight) {
		y -= 4;
		page.drawRectangle({ x: M, y: y - 34, width: W, height: 46, color: rgb(0.94, 0.96, 1), borderColor: rgb(0.8, 0.86, 1), borderWidth: 1 });
		y -= 6;
		text(input.highlight.label.toUpperCase(), M + 14, 8, bold, MUTED);
		y -= 20;
		text(input.highlight.value, M + 14, 18, bold, BRAND);
		y -= 26;
	}
	y -= 6;

	// key/value blocks, two columns
	for (const block of input.blocks) {
		const fields = block.fields.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
		if (!fields.length) continue;
		ensure(40);
		sectionTitle(block.title);
		const colW = (W - 16) / 2;
		for (let i = 0; i < fields.length; i += 2) {
			const pair = fields.slice(i, i + 2);
			const lines = pair.map(([, v]) => wrap(String(v), 10, colW));
			const h = 12 + Math.max(...lines.map((l) => l.length)) * 13 + 6;
			ensure(h);
			pair.forEach(([label], k) => {
				const x = M + k * (colW + 16);
				const y0 = y;
				text(label.toUpperCase(), x, 7.5, bold, MUTED);
				y -= 12;
				for (const l of lines[k]) {
					text(l, x, 10);
					y -= 13;
				}
				y = y0;
			});
			y -= h;
		}
		y -= 6;
	}

	// signed indemnity text
	if (input.form?.length) {
		ensure(40);
		sectionTitle('Indemnity & waiver agreement');
		for (const [i, s] of input.form.entries()) {
			const a = input.answers?.[i] ?? null;
			ensure(36);
			for (const l of wrap(`${i + 1}. ${s.title}`, 11, W, bold)) {
				text(l, M, 11, bold);
				y -= 15;
			}
			for (const para of s.content.split(/\n+/)) {
				for (const l of wrap(para, 9.5, W)) {
					ensure(13);
					text(l, M, 9.5, font, rgb(0.2, 0.23, 0.3));
					y -= 12.5;
				}
				y -= 3;
			}
			if (s.type === 'acknowledgement') {
				ensure(16);
				const ok = !!a?.accepted;
				page.drawRectangle({ x: M, y: y - 2, width: 9, height: 9, borderColor: INK, borderWidth: 0.8, color: ok ? BRAND : undefined });
				text(ok ? 'Accepted' : 'Not accepted', M + 15, 9, bold, ok ? INK : rgb(0.8, 0.1, 0.1));
				y -= 16;
			} else if (s.type === 'initials') {
				ensure(16);
				text(`Initials: ${a?.initials ?? '—'}`, M, 10, bold);
				y -= 16;
			} else if (s.type === 'signature') {
				const png = a?.signatureFileId ? input.answerImages?.[a.signatureFileId] : undefined;
				await drawSignature({ label: s.title, name: '', png });
			}
			y -= 6;
		}
	}

	// signatures
	if (input.signatures?.length) {
		ensure(110);
		sectionTitle('Signatures');
		for (const sig of input.signatures) await drawSignature(sig);
		if (input.integrity) {
			ensure(14);
			text(input.integrity, M, 7, font, MUTED);
			y -= 12;
		}
		if (input.signedAtText) {
			text(`Signed ${input.signedAtText}`, M, 9, font, MUTED);
			y -= 14;
		}
	}

	// footer on every page
	pages.forEach((p, i) => {
		p.drawLine({ start: { x: M, y: M - 6 }, end: { x: A4[0] - M, y: M - 6 }, color: LINE, thickness: 0.6 });
		p.drawText(safe(input.footer), { x: M, y: M - 20, size: 7.5, font, color: MUTED });
		const n = `Page ${i + 1} of ${pages.length}`;
		p.drawText(n, { x: A4[0] - M - font.widthOfTextAtSize(n, 7.5), y: M - 20, size: 7.5, font, color: MUTED });
	});

	return doc.save();

	function sectionTitle(t: string) {
		y -= 4;
		text(t.toUpperCase(), M, 9, bold, BRAND);
		y -= 6;
		page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, color: LINE, thickness: 0.8 });
		y -= 16;
	}

	async function drawSignature(sig: { label: string; name: string; png?: Uint8Array | null }) {
		const boxH = 70;
		ensure(boxH + 34);
		text(sig.label.toUpperCase(), M, 7.5, bold, MUTED);
		y -= 6;
		page.drawRectangle({ x: M, y: y - boxH, width: 240, height: boxH, borderColor: LINE, borderWidth: 0.8 });
		let img: PDFImage | null = null;
		if (sig.png?.length) {
			try {
				img = await doc.embedPng(sig.png);
			} catch {
				img = null;
			}
		}
		if (img) {
			const scale = Math.min((240 - 12) / img.width, (boxH - 8) / img.height);
			page.drawImage(img, { x: M + 6, y: y - boxH + 4, width: img.width * scale, height: img.height * scale });
		} else {
			page.drawText(safe(sig.name ? `/s/ ${sig.name}` : 'No signature image'), { x: M + 10, y: y - boxH / 2, size: 12, font, color: MUTED });
		}
		y -= boxH + 12;
		if (sig.name) {
			text(sig.name, M, 10, bold);
			y -= 16;
		}
	}
}

/** Replace characters the standard (WinAnsi) fonts can't encode. */
function makeSanitizer(font: PDFFont) {
	const ok = new Map<string, boolean>();
	return (s: string) =>
		[...s.replace(/\t/g, '  ').replace(/\r/g, '')]
			.map((ch) => {
				if (ch === '\n') return ' ';
				let good = ok.get(ch);
				if (good === undefined) {
					try {
						font.encodeText(ch);
						font.widthOfTextAtSize(ch, 10);
						good = true;
					} catch {
						good = false;
					}
					ok.set(ch, good);
				}
				return good ? ch : (ch.normalize('NFKD').replace(/[^\x20-\x7e]/g, '') || '?');
			})
			.join('');
}

export function wrapText(s: string, font: PDFFont, size: number, width: number): string[] {
	const out: string[] = [];
	for (const para of s.split('\n')) {
		const words = para.split(/\s+/).filter(Boolean);
		let line = '';
		for (const w of words) {
			const next = line ? `${line} ${w}` : w;
			if (font.widthOfTextAtSize(next, size) <= width) {
				line = next;
				continue;
			}
			if (line) out.push(line);
			// hard-break very long words
			let rest = w;
			while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
				let k = rest.length - 1;
				while (k > 1 && font.widthOfTextAtSize(rest.slice(0, k), size) > width) k--;
				out.push(rest.slice(0, k));
				rest = rest.slice(k);
			}
			line = rest;
		}
		out.push(line);
	}
	return out;
}
