/** In-app feedback (posted as public GitHub issues): shared by the form and the server. Client-safe. */
export const FEEDBACK_TYPES = ['bug', 'idea', 'other'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = { bug: 'Bug', idea: 'Idea', other: 'Other' };

export const FEEDBACK_MIN_CHARS = 10;
export const FEEDBACK_MAX_CHARS = 5000;

/** Per user: at most this many per rolling 24 h, and one per `FEEDBACK_COOLDOWN_MS`. */
export const FEEDBACK_DAILY_LIMIT = 5;
export const FEEDBACK_COOLDOWN_MS = 30_000;

export const FEEDBACK_PUBLIC_NOTICE =
	"Feedback is posted publicly on GitHub. Don't include personal details, names of other people, or payment info.";
