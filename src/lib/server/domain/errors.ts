/** Machine-readable error codes thrown by domain services. UI maps them to messages. */
export type DomainErrorCode =
	| 'not_found'
	| 'forbidden'
	| 'invalid'
	| 'conflict'
	| 'load_full'
	| 'overweight'
	| 'load_locked'
	| 'already_on_load'
	| 'invalid_transition'
	| 'insufficient_funds'
	| 'currency_mismatch'
	| 'wallet_disabled'
	| 'membership_expired'
	| 'not_checked_in'
	| 'cannot_sign_own_jump'
	| 'signer_not_licensed'
	| 'booking_full';

export class DomainError extends Error {
	constructor(
		readonly code: DomainErrorCode,
		message: string,
		readonly details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'DomainError';
	}
}

export function isDomainError(e: unknown, code?: DomainErrorCode): e is DomainError {
	return e instanceof DomainError && (!code || e.code === code);
}

export function assertFound<T>(value: T | undefined | null, what: string): T {
	if (value === undefined || value === null) throw new DomainError('not_found', `${what} not found`);
	return value;
}
