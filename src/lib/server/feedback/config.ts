import { FEEDBACK_API_BASE, FEEDBACK_REPO, GITHUB_FEEDBACK_TOKEN } from '$app/env/private';
import { feedbackConfig, type FeedbackConfig } from './index.ts';

/** Feedback settings from the environment; null = feature disabled (no token). */
export function serverFeedbackConfig(): FeedbackConfig | null {
	return feedbackConfig({ GITHUB_FEEDBACK_TOKEN, FEEDBACK_REPO, FEEDBACK_API_BASE });
}
