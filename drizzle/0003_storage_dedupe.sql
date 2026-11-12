DROP INDEX `files_key_unique`;--> statement-breakpoint
CREATE INDEX `files_key_idx` ON `files` (`key`);--> statement-breakpoint
CREATE INDEX `files_sha_idx` ON `files` (`sha256`);--> statement-breakpoint
ALTER TABLE `indemnity_signatures` ADD `snapshot_hash` text;