export type ToastTone = 'info' | 'success' | 'error';
export type ToastItem = { id: number; title: string; description?: string; tone: ToastTone };

let nextId = 1;

class ToastStore {
	items = $state<ToastItem[]>([]);

	show(title: string, opts: { description?: string; tone?: ToastTone; duration?: number } = {}) {
		const id = nextId++;
		this.items.push({ id, title, description: opts.description, tone: opts.tone ?? 'info' });
		setTimeout(() => this.dismiss(id), opts.duration ?? 4000);
		return id;
	}
	success = (title: string, description?: string) => this.show(title, { description, tone: 'success' });
	error = (title: string, description?: string) => this.show(title, { description, tone: 'error' });
	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

/** Client-side toast queue. Render <Toaster /> once in the root layout. */
export const toast = new ToastStore();
