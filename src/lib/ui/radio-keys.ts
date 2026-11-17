/**
 * Keyboard model for custom `role="radio"` groups (WAI-ARIA radio group pattern): one tab
 * stop per group, arrow keys move to the next/previous enabled option (wrapping) and select
 * it, Home/End jump to the first/last enabled option. Client-safe, no DOM.
 */

/** Index of the option that should be in the tab order: the checked one, else the first enabled. */
export function radioTabIndex(enabled: readonly boolean[], checked: number): number {
	if (checked >= 0 && enabled[checked]) return checked;
	return enabled.indexOf(true);
}

/**
 * Index to move to after `key` from option `from`, or null when the key isn't handled or
 * there's nothing to move to.
 */
export function radioKeyTarget(enabled: readonly boolean[], from: number, key: string): number | null {
	const n = enabled.length;
	if (!enabled.some(Boolean)) return null;
	const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
	if (step) {
		for (let k = 1; k <= n; k++) {
			const i = (((from + step * k) % n) + n) % n;
			if (enabled[i]) return i === from ? null : i;
		}
		return null;
	}
	if (key === 'Home') return enabled.indexOf(true);
	if (key === 'End') return enabled.lastIndexOf(true);
	return null;
}
