import { describe, expect, test } from 'bun:test';
import { createTeam, getTeam } from '../domain/teams.ts';
import { freshDb, makeDropzone, makeMember, makeUser } from '../domain/testing.ts';
import { teamFor, teamStaffChoices } from './teams.ts';

const status = async (p: Promise<unknown>) => {
	try {
		await p;
		return 200;
	} catch (e) {
		return (e as { status?: number }).status ?? 500;
	}
};

describe('teamFor', () => {
	test('staff with teams.manage can see and edit their DZ teams, not other DZs or personal teams', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		const { dz: other } = await makeDropzone(db);
		const manifest = await makeMember(db, dz.id, ['manifest']);
		const packer = await makeMember(db, dz.id, ['staff']);
		const jumper = await makeUser(db);
		const dzTeam = await createTeam(db, { dropzoneId: dz.id }, { name: 'Coast 4-way', memberIds: [jumper.id] });
		const otherTeam = await createTeam(db, { dropzoneId: other.id }, { name: 'Elsewhere' });
		const personal = await createTeam(db, { userId: jumper.id }, { name: 'Zoo Crew', memberIds: [jumper.id] });

		const m = await teamFor(db, manifest.id, dzTeam.id);
		expect(m).toMatchObject({ manages: true, canEdit: true, isMember: false, isOwner: false });
		// a DZ team's member sees it but can't edit; a staff role without teams.manage can't open it
		expect(await teamFor(db, jumper.id, dzTeam.id)).toMatchObject({ manages: false, canEdit: false, isMember: true });
		expect(await status(teamFor(db, packer.id, dzTeam.id))).toBe(404);
		expect(await status(teamFor(db, manifest.id, otherTeam.id))).toBe(404);
		expect(await status(teamFor(db, manifest.id, personal.id))).toBe(404);
		expect(await teamFor(db, jumper.id, personal.id)).toMatchObject({ isOwner: true, canEdit: true, manages: false });
	});

	test('teamStaffChoices: DZ teams offer the DZ coaches/instructors/video too, and keep the current coach', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		await makeMember(db, dz.id, ['coach'], { name: 'Cora Coach' });
		await makeMember(db, dz.id, ['videographer'], { name: 'Vic Video' });
		await makeMember(db, dz.id, ['jumper'], { name: 'Jo Jumper' });
		const member = await makeUser(db, { name: 'Mo Member' });
		const legacy = await makeUser(db, { name: 'Lee Legacy' });
		const dzTeam = await getTeam(db, (await createTeam(db, { dropzoneId: dz.id }, { name: 'A', memberIds: [member.id], coachUserId: legacy.id })).id);
		expect((await teamStaffChoices(db, dzTeam)).map((c) => c.name)).toEqual(['Cora Coach', 'Lee Legacy', 'Mo Member', 'Vic Video']);
		const personal = await getTeam(db, (await createTeam(db, { userId: member.id }, { name: 'B', memberIds: [member.id] })).id);
		expect((await teamStaffChoices(db, personal)).map((c) => c.id)).toEqual([member.id]);
	});
});
