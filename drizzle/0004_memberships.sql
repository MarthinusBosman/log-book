CREATE TABLE `membership_checks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`number` text NOT NULL,
	`status` text NOT NULL,
	`member_name` text,
	`licence` text,
	`dropzone` text,
	`ratings` text DEFAULT '[]' NOT NULL,
	`current` integer DEFAULT false NOT NULL,
	`expiry` text,
	`checked_at` integer NOT NULL,
	`last_attempt_at` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`expired_notified_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `membership_checks_status_idx` ON `membership_checks` (`provider`,`status`);--> statement-breakpoint
CREATE TABLE `provider_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
