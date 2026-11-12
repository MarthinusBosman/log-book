/**
 * Server entry for Jump Master data: accepts either a normalised Log-Book bundle or the raw JSON form
 * of the original's documents (`jumpmaster-docs`, see DATA_MODEL.md), maps the latter with the
 * shared pure mapper, and validates the result. Applying goes through `importBundle`.
 */
import { BundleError, isBundle, parseBundle, type Bundle } from '../../../import/bundle.ts';
import { brand } from '../../../brand.ts';
import { isJmDocs, mapJumpMasterDocs, type JmDocs, type MapOptions } from '../../../import/jumpmaster/map.ts';

export { mapJumpMasterDocs, isJmDocs, type JmDocs };
export * from '../../../import/jumpmaster/values.ts';

export type ParsedUpload = { bundle: Bundle; warnings: string[]; kind: 'bundle' | 'jumpmaster-docs' };

/** Parse an uploaded JSON payload (string or parsed) into a validated bundle. */
export function parseImportPayload(input: string | unknown, opts: MapOptions = {}): ParsedUpload {
	let data: unknown = input;
	if (typeof input === 'string') {
		try {
			data = JSON.parse(input);
		} catch {
			throw new BundleError("That file isn't valid JSON.");
		}
	}
	if (isBundle(data)) return { bundle: parseBundle(data), warnings: [], kind: 'bundle' };
	if (isJmDocs(data)) {
		const { bundle, warnings } = mapJumpMasterDocs(data, opts);
		return { bundle: parseBundle(bundle), warnings, kind: 'jumpmaster-docs' };
	}
	throw new BundleError(`Unrecognised file. Upload a ${brand.name} export or a Jump Master data file.`);
}
