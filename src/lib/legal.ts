/**
 * Facts shared by the privacy policy (/privacy) and terms of use (/terms). Client-safe.
 * Bump `effective` whenever either page changes in substance (the pages show it).
 */
export const LEGAL = {
	/** YYYY-MM-DD the current versions took effect. */
	effective: '2026-11-13',
	effectiveLabel: '13 November 2026',
	regulator: {
		name: 'Information Regulator (South Africa)',
		url: 'https://inforegulator.org.za',
		complaintsEmail: 'POPIAComplaints@inforegulator.org.za',
		enquiriesEmail: 'enquiries@inforegulator.org.za'
	}
} as const;
