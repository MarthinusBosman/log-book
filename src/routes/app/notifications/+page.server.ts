import { redirect } from '@sveltejs/kit';
import { listNotifications, markRead } from '#lib/server/domain/notifications.ts';
import { requireUser, str } from '#lib/server/jumper/forms.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);
	const unreadOnly = url.searchParams.get('filter') === 'unread';
	const list = await listNotifications(locals.db, user.id, { unreadOnly, limit: 100 });
	return {
		unreadOnly,
		notifications: list.map((n) => ({
			id: n.id,
			type: n.type,
			title: n.title,
			body: n.body,
			href: n.href,
			read: n.read,
			createdAt: n.createdAt.getTime()
		}))
	};
};

export const actions: Actions = {
	read: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const id = str(form, 'id');
		if (id) await markRead(locals.db, user.id, [id]);
		return { success: 'Marked as read' };
	},
	readAll: async ({ locals }) => {
		const user = requireUser(locals);
		await markRead(locals.db, user.id);
		return { success: 'All caught up' };
	},
	/** Mark read then follow the notification's link (works without JS). */
	open: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const id = str(form, 'id');
		const href = str(form, 'href');
		if (id) await markRead(locals.db, user.id, [id]);
		redirect(303, href.startsWith('/app') ? href : '/app/notifications');
	}
};
