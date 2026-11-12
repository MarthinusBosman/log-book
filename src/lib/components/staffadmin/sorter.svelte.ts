/** Tiny client-side table sorter: `const s = new Sorter('name')`, `s.sort(rows, accessors)`. */
export class Sorter<K extends string> {
	key = $state<K>() as K;
	dir = $state<'asc' | 'desc'>('asc');
	constructor(key: K, dir: 'asc' | 'desc' = 'asc') {
		this.key = key;
		this.dir = dir;
	}
	toggle(key: K) {
		if (this.key === key) this.dir = this.dir === 'asc' ? 'desc' : 'asc';
		else {
			this.key = key;
			this.dir = 'asc';
		}
	}
	sort<T>(rows: T[], accessors: Record<K, (r: T) => string | number | null | undefined>): T[] {
		const get = accessors[this.key];
		const m = this.dir === 'asc' ? 1 : -1;
		return [...rows].sort((a, b) => {
			const x = get(a);
			const y = get(b);
			if (x == null && y == null) return 0;
			if (x == null) return 1;
			if (y == null) return -1;
			return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * m;
		});
	}
	aria(key: K): 'ascending' | 'descending' | 'none' {
		return this.key === key ? (this.dir === 'asc' ? 'ascending' : 'descending') : 'none';
	}
}
