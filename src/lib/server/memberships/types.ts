/**
 * Association membership providers (PASA today, USPA later).
 *
 * A provider knows how to look ONE member up by their association number and, optionally, how to
 * tell whether a number is on the association's current (paid-up) members list. Everything else —
 * caching, rate limiting, name matching, applying results to the profile — lives in `service.ts`,
 * so a new provider only has to implement this interface.
 */
import type { MembershipCheckRating } from '../db/schema.ts';

export type ProviderId = 'pasa' | 'uspa';

/** What the association publishes about one member. */
export type ProviderMember = {
	number: string;
	name: string;
	licence: string | null;
	dropzone: string | null;
	ratings: MembershipCheckRating[];
};

/** Throttled GET with the app's User-Agent (see `http.ts`). Returns the response body as text. */
export type HttpGet = (url: string) => Promise<{ status: number; text: string }>;

export interface MembershipProvider {
	id: ProviderId;
	/** Short label used in UI copy ("PASA expired"). */
	label: string;
	/** Canonical member number, or null when the input can't be one. */
	normaliseNumber(input: string): string | null;
	/** One member, or null when the association has no such member. Throws on network/format errors. */
	fetchMember(number: string, get: HttpGet): Promise<ProviderMember | null>;
	/**
	 * Member numbers on the current (paid-up) list. Optional: providers without a public list
	 * report membership status from `fetchMember` instead. Called at most once a day (cached).
	 */
	fetchCurrentNumbers?(get: HttpGet): Promise<string[]>;
	/** Expiry date (YYYY-MM-DD) implied by being current / not current on `today`. */
	expiryFor(current: boolean, today: string): string;
}

/** Network/format failure talking to the association (the UI falls back to manual entry). */
export class ProviderUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProviderUnavailableError';
	}
}
