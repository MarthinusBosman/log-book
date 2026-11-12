import { error, redirect } from '@sveltejs/kit';
import { INDEMNITY_AUDIENCES, INDEMNITY_SECTION_TYPES, type IndemnityAudience, type IndemnitySectionType } from '#lib/domain/constants.ts';
import {
	addSection,
	deleteSection,
	getSection,
	isSignatureValid,
	latestSportSignatures,
	listSections,
	listSignatures,
	moveSection,
	setIndemnityActive,
	signatureExpiresAt,
	updateSection
} from '#lib/server/domain/indemnity.ts';
import { listMembers } from '#lib/server/domain/dropzone-admin.ts';
import { can } from '#lib/server/domain/permissions.ts';
import { DomainError } from '#lib/server/domain/errors.ts';
import { DZ_COOKIE, listMemberships } from '#lib/server/dropzones/index.ts';
import { failFrom, staffContext, str } from '#lib/server/tandems/http.ts';
import type { RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const VIEW_CAPS = ['indemnity.manage', 'tandems.manage', 'checkin.manage'] as const;
const TABS = ['tandem', 'sport', 'signed', 'jumpers'] as const;
type Tab = (typeof TABS)[number];

export const load: PageServerLoad = async (event) => {
	const { locals, url, cookies } = event;
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	// Jumpers without a staff capability go straight to signing their own waiver.
	const memberships = await listMemberships(locals.db, locals.user.id);
	const current = memberships.find((m) => m.dropzone.slug === cookies.get(DZ_COOKIE)) ?? memberships[0];
	if (!current) error(403, 'Join or create a dropzone first.');
	let staff = false;
	for (const c of VIEW_CAPS) if (await can(locals.db, locals.user.id, current.dropzone.id, c)) staff = true;
	if (!staff) redirect(303, `/app/waivers/sign/${current.dropzone.id}`);

	const { dz, userId } = await staffContext(event, [...VIEW_CAPS]);
	const db = locals.db;
	const canEdit = await can(db, userId, dz.id, 'indemnity.manage');
	const qTab = url.searchParams.get('tab') as Tab | null;
	const tab: Tab = qTab && TABS.includes(qTab) ? qTab : canEdit ? 'tandem' : 'signed';
	const q = url.searchParams.get('q')?.trim() ?? '';
	const audience = url.searchParams.get('audience');

	const [tandem, sport] = await Promise.all([listSections(db, dz.id, 'tandem'), listSections(db, dz.id, 'sport')]);
	const strip = (s: (typeof tandem)[number]) => ({ id: s.id, title: s.title, content: s.content, type: s.type, position: s.position });

	let signed: Awaited<ReturnType<typeof listSignatures>> = [];
	let jumpers: { userId: string; name: string; email: string; roles: string[]; signedAt: Date | null; expiresAt: Date | null; valid: boolean; signatureId: string | null }[] = [];
	if (tab === 'signed') {
		signed = await listSignatures(db, dz.id, {
			search: q || undefined,
			audience: audience === 'tandem' || audience === 'sport' ? audience : undefined,
			limit: 200
		});
	}
	if (tab === 'jumpers') {
		const [members, latest] = await Promise.all([listMembers(db, dz.id), latestSportSignatures(db, dz.id)]);
		const needle = q.toLowerCase();
		jumpers = members
			.filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle))
			.map((m) => {
				const sig = latest.get(m.userId);
				return {
					userId: m.userId,
					name: m.name,
					email: m.email,
					roles: m.roles.map((r) => r.role),
					signedAt: sig?.signedAt ?? null,
					expiresAt: sig ? signatureExpiresAt(sig) : null,
					valid: sig ? isSignatureValid(sig) : false,
					signatureId: sig?.id ?? null
				};
			})
			.sort((a, b) => Number(a.valid) - Number(b.valid) || a.name.localeCompare(b.name));
	}

	return {
		dz: { id: dz.id, name: dz.name, slug: dz.slug, tandemActive: dz.indemnityTandemActive, sportActive: dz.indemnitySportActive },
		tab,
		q,
		audience: audience ?? '',
		canEdit,
		sections: { tandem: tandem.map(strip), sport: sport.map(strip) },
		signed,
		jumpers
	};
};

async function editor(event: RequestEvent) {
	const c = await staffContext(event, 'indemnity.manage');
	return { ...c, form: await event.request.formData() };
}

/** Section must belong to the active dropzone. */
async function ownSection(event: RequestEvent, dzId: string, id: string) {
	const s = id ? await getSection(event.locals.db, id) : undefined;
	if (!s || s.dropzoneId !== dzId) throw new DomainError('not_found', 'Section not found');
	return s;
}

const audienceOf = (v: string): IndemnityAudience => {
	if (!(INDEMNITY_AUDIENCES as readonly string[]).includes(v)) throw new DomainError('invalid', 'Choose tandem or sport');
	return v as IndemnityAudience;
};
const typeOf = (v: string): IndemnitySectionType => ((INDEMNITY_SECTION_TYPES as readonly string[]).includes(v) ? (v as IndemnitySectionType) : 'text');

export const actions: Actions = {
	add: async (event) => {
		const { dz, form } = await editor(event);
		try {
			await addSection(event.locals.db, {
				dropzoneId: dz.id,
				audience: audienceOf(str(form, 'audience')),
				title: str(form, 'title'),
				content: str(form, 'content'),
				type: typeOf(str(form, 'type'))
			});
			return { ok: true, message: 'Section added' };
		} catch (e) {
			return failFrom(e);
		}
	},
	update: async (event) => {
		const { dz, form } = await editor(event);
		try {
			const s = await ownSection(event, dz.id, str(form, 'id'));
			await updateSection(event.locals.db, s.id, { title: str(form, 'title'), content: str(form, 'content'), type: typeOf(str(form, 'type')) });
			return { ok: true, message: 'Section saved' };
		} catch (e) {
			return failFrom(e);
		}
	},
	move: async (event) => {
		const { dz, form } = await editor(event);
		try {
			const s = await ownSection(event, dz.id, str(form, 'id'));
			await moveSection(event.locals.db, s.id, str(form, 'direction') === 'up' ? 'up' : 'down');
			return { ok: true };
		} catch (e) {
			return failFrom(e);
		}
	},
	delete: async (event) => {
		const { dz, form } = await editor(event);
		try {
			const s = await ownSection(event, dz.id, str(form, 'id'));
			await deleteSection(event.locals.db, s.id);
			return { ok: true, message: 'Section removed' };
		} catch (e) {
			return failFrom(e);
		}
	},
	activate: async (event) => {
		const { dz, form } = await editor(event);
		try {
			const audience = audienceOf(str(form, 'audience'));
			const active = str(form, 'active') === 'true';
			if (active && (await listSections(event.locals.db, dz.id, audience)).length === 0) {
				throw new DomainError('invalid', 'Add at least one section before activating the form');
			}
			await setIndemnityActive(event.locals.db, dz.id, audience, active);
			const who = audience === 'tandem' ? 'Tandem' : 'Sport jumper';
			return { ok: true, message: active ? `${who} waiver is now active` : `${who} waiver switched off` };
		} catch (e) {
			return failFrom(e);
		}
	}
};
