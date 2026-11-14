import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, users, type Dropzone } from '../db/schema.ts';
import { currentCheckin } from '../domain/checkins.ts';
import { aadStatus, repackIntervalDays, repackStatus, listUserRigs } from '../domain/gear.ts';
import { openLoadsToday, upcomingSlotsForUser } from '../domain/loads.ts';
import { logbookTotals } from '../domain/logbook.ts';
import { listRatings, membershipStatus } from '../domain/profile.ts';
import { listAccountsForUser } from '../domain/wallet.ts';
import { needsSportIndemnity } from '../domain/indemnity.ts';
import { addDays, daysBetween, localDate } from '../domain/time.ts';
import { ASSOCIATION_LABELS, SELF_SERVICE_LOAD_STATUSES, type DueStatus } from '../../domain/constants.ts';

export type JumperAlert = { id: string; tone: 'warning' | 'danger'; title: string; body: string; href: string };

/**
 * Everything the jumper half of /app needs, in one round of queries. `dropzoneById` lets the route
 * share its per-request dropzone cache (the layout already read the current dropzone's row).
 */
export async function loadJumperDashboard(
	db: Database,
	userId: string,
	currentDropzoneId: string | null,
	now = Date.now(),
	dropzoneById: (id: string) => Promise<Dropzone | undefined> = async (id) => (await db.select().from(dropzones).where(eq(dropzones.id, id)).limit(1))[0]
) {
	const dz = currentDropzoneId ? await dropzoneById(currentDropzoneId) : undefined;
	const tz = dz?.timezone ?? 'UTC';
	const today = localDate(now, tz);
	// a day of slack so loads in DZs east of us aren't dropped
	const [user, checkin, upcoming, totals, rigs, ratings, accounts] = await Promise.all([
		// only the membership fields (never the whole row: it carries the password hash)
		db
			.select({ association: users.association, associationExpiry: users.associationExpiry })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1)
			.then((r) => r[0] ?? { association: null, associationExpiry: null }),
		currentCheckin(db, userId),
		upcomingSlotsForUser(db, userId, addDays(today, -1)),
		logbookTotals(db, userId, today),
		listUserRigs(db, userId),
		listRatings(db, userId),
		listAccountsForUser(db, userId)
	]);
	const next = upcoming.find((u) => u.load.day >= localDate(now, u.dropzone.timezone)) ?? null;

	const checkedInDzId = checkin?.dropzone.id ?? null;
	const checkedInDz = checkedInDzId ? (checkedInDzId === dz?.id ? dz : await dropzoneById(checkedInDzId)) : undefined;
	// The DZ you're jumping at (checked in, else the selected one) wants a signed sport waiver first.
	const waiverDz = checkedInDz ?? dz ?? null;
	const [openLoads, needsWaiver] = await Promise.all([
		checkedInDz ? openLoadsToday(db, checkedInDz, now) : Promise.resolve([]),
		waiverDz ? needsSportIndemnity(db, waiverDz, userId) : Promise.resolve(false)
	]);
	const joinable = openLoads.filter(
		(l) => SELF_SERVICE_LOAD_STATUSES.includes(l.status) && !l.stats.full && !l.slots.some((s) => s.userId === userId)
	);

	// warnings
	const alerts: JumperAlert[] = [];
	const interval = repackIntervalDays({ dropzoneDays: dz?.repackIntervalDays, country: dz?.country });
	const warnDays = dz?.settings.gearWarnDays ?? 30;
	for (const rig of rigs.filter((r) => r.active)) {
		const name = rig.name || rig.container || 'Your rig';
		const rp = repackStatus(rig, { today, intervalDays: interval, warnDays });
		if (rp.status === 'overdue' || rp.status === 'due_soon') {
			alerts.push({
				id: `repack-${rig.id}`,
				tone: rp.status === 'overdue' ? 'danger' : 'warning',
				title: rp.status === 'overdue' ? 'Reserve repack overdue' : 'Reserve repack due soon',
				body: `${name}: ${rp.status === 'overdue' ? `was due ${rp.dueOn}` : `due ${rp.dueOn} (${rp.daysLeft} days)`}`,
				href: `/app/my-gear/${rig.id}`
			});
		}
		const aad = aadStatus(rig, { today, warnDays });
		if (aad.status === 'overdue' || aad.status === 'due_soon') {
			alerts.push({
				id: `aad-${rig.id}`,
				tone: aad.status === 'overdue' ? 'danger' : 'warning',
				title: aad.status === 'overdue' ? 'AAD service overdue' : 'AAD service due soon',
				body: `${name}${rig.aad ? ` (${rig.aad})` : ''}: ${aad.status === 'overdue' ? `was due ${aad.dueOn}` : `due ${aad.dueOn}`}`,
				href: `/app/my-gear/${rig.id}`
			});
		}
	}
	const membership = membershipStatus(user, today);
	const assoc = user.association ? ASSOCIATION_LABELS[user.association] : 'Association';
	if (membership.status === 'expired' || membership.status === 'expiring') {
		alerts.push({
			id: 'membership',
			tone: membership.status === 'expired' ? 'danger' : 'warning',
			title: membership.status === 'expired' ? `${assoc} membership expired` : `${assoc} membership expiring`,
			body:
				membership.status === 'expired'
					? `Expired on ${membership.expiry}. You can't self-manifest until it's renewed.`
					: `Expires on ${membership.expiry} (${membership.daysLeft} days).`,
			href: '/app/profile?tab=credentials'
		});
	} else if (membership.status === 'none') {
		alerts.push({
			id: 'membership-none',
			tone: 'warning',
			title: 'Add your membership',
			body: 'Add your association, number and expiry so manifest can verify you.',
			href: '/app/profile?tab=credentials'
		});
	}
	for (const r of ratings) {
		if (!r.expiresOn) continue;
		const d = daysBetween(today, r.expiresOn);
		if (d <= 30) {
			alerts.push({
				id: `rating-${r.id}`,
				tone: d < 0 ? 'danger' : 'warning',
				title: d < 0 ? `${r.rating} rating expired` : `${r.rating} rating expiring`,
				body: d < 0 ? `Expired on ${r.expiresOn}.` : `Expires on ${r.expiresOn} (${d} days).`,
				href: '/app/profile?tab=credentials'
			});
		}
	}
	if (waiverDz && needsWaiver) {
		alerts.unshift({
			id: 'waiver',
			tone: 'warning',
			title: `Sign the ${waiverDz.name} waiver`,
			body: 'Takes a minute on your phone. You need it before you can join a load.',
			href: `/app/waivers/sign/${waiverDz.id}`
		});
	}
	alerts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1));

	// next repack summary for the stat tile
	const repacks = rigs
		.filter((r) => r.active)
		.map((r) => repackStatus(r, { today, intervalDays: interval, warnDays }))
		.filter((i) => i.dueOn)
		.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
	const nextRepack: { dueOn: string | null; daysLeft: number | null; status: DueStatus } = repacks[0] ?? {
		dueOn: null,
		daysLeft: null,
		status: 'unknown'
	};

	const account = accounts.find((a) => a.dropzone.id === (checkedInDzId ?? currentDropzoneId)) ?? accounts[0] ?? null;

	return {
		today,
		now,
		checkin: checkin
			? {
					dropzone: checkin.dropzone,
					checkedInAt: checkin.checkin.checkedInAt.getTime(),
					verified: checkin.checkin.verified,
					weightKg: checkin.checkin.weightKg,
					gearRental: checkin.checkin.gearRental
				}
			: null,
		next: next
			? {
					dropzone: next.dropzone,
					load: {
						id: next.load.id,
						day: next.load.day,
						loadNumber: next.load.loadNumber,
						status: next.load.status,
						aircraftName: next.load.aircraftName,
						callDueAt: next.load.callDueAt?.getTime() ?? null,
						scheduledAt: next.load.scheduledAt?.getTime() ?? null,
						boardingAt: next.load.boardingAt?.getTime() ?? null
					},
					slot: { id: next.slot.id, jumpType: next.slot.jumpType, totalMinor: next.slot.totalMinor, currency: next.slot.currency, paid: next.slot.paid }
				}
			: null,
		moreUpcoming: Math.max(0, upcoming.length - 1),
		joinableLoads: joinable.length,
		totals,
		nextRepack,
		membership,
		alerts,
		wallet: account
			? {
					dropzone: account.dropzone,
					availableMinor: account.account.availableMinor,
					pendingMinor: account.account.pendingMinor,
					currency: account.account.currency
				}
			: null,
		walletCount: accounts.length
	};
}

export type JumperDashboardData = Awaited<ReturnType<typeof loadJumperDashboard>>;
