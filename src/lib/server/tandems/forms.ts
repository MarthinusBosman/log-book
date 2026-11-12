/** FormData → passenger input (staff create/edit + public booking). */
import { GENDERS, TANDEM_EXTRAS, type SlotExtra } from '../../domain/constants.ts';
import type { PassengerInput } from '../domain/tandems.ts';
import { DomainError } from '../domain/errors.ts';
import { dobProblem, isIsoDate } from '../domain/time.ts';
import { optNum, optStr, str } from './http.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only keys present in the form are returned, so partial forms don't wipe other fields. */
export function parsePassengerForm(f: FormData): Partial<PassengerInput> {
	const out: Record<string, unknown> = {};
	const textKeys = [
		'name',
		'email',
		'phone',
		'idNumber',
		'dob',
		'nationality',
		'addressLine1',
		'addressLine2',
		'city',
		'postalCode',
		'country',
		'guardianName',
		'guardianEmail',
		'guardianIdNumber',
		'emergencyName',
		'emergencyEmail',
		'emergencyPhone',
		'emergencyAddressLine1',
		'emergencyCity',
		'emergencyCountry',
		'jumpDate',
		'bookingTime',
		'heardFrom',
		'note'
	] as const;
	for (const k of textKeys) if (f.has(k)) out[k] = optStr(f, k);
	if (f.has('gender')) {
		const g = str(f, 'gender');
		out.gender = (GENDERS as readonly string[]).includes(g) ? g : null;
	}
	for (const k of ['weightKg', 'heightCm'] as const) if (f.has(k)) out[k] = optNum(f, k);
	if (f.has('extras_present')) {
		out.extras = f.getAll('extras').map(String).filter((e): e is SlotExtra => (TANDEM_EXTRAS as readonly string[]).includes(e));
	}
	if (typeof out.name === 'string') out.name = out.name.trim();
	if (out.email && !EMAIL_RE.test(String(out.email))) throw new DomainError('invalid', 'Please enter a valid email address');
	if (out.guardianEmail && !EMAIL_RE.test(String(out.guardianEmail))) throw new DomainError('invalid', "Please enter a valid guardian email");
	const dobError = out.dob ? dobProblem(String(out.dob)) : null;
	if (dobError) throw new DomainError('invalid', dobError);
	if (out.jumpDate && !isIsoDate(out.jumpDate)) throw new DomainError('invalid', 'Jump date must be a valid date');
	if (out.weightKg != null && ((out.weightKg as number) < 20 || (out.weightKg as number) > 250)) throw new DomainError('invalid', 'Weight looks wrong — enter it in kg');
	if (out.heightCm != null && ((out.heightCm as number) < 80 || (out.heightCm as number) > 250)) throw new DomainError('invalid', 'Height looks wrong — enter it in cm');
	return out as Partial<PassengerInput>;
}
