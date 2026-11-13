CREATE TABLE `feedback_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`github_issue_number` integer,
	`github_issue_url` text,
	`reporter_ref` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_submissions_user_idx` ON `feedback_submissions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_submissions_ref_idx` ON `feedback_submissions` (`reporter_ref`);