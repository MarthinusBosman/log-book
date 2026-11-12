CREATE TABLE `file_blobs` (
	`key` text NOT NULL,
	`part` integer NOT NULL,
	`bytes` blob NOT NULL,
	`content_type` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`key`, `part`)
);
