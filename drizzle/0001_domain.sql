CREATE TABLE `aircraft` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`name` text NOT NULL,
	`tail_number` text,
	`capacity` integer NOT NULL,
	`weight_limit_kg` real,
	`default_pilot_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_pilot_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `aircraft_dropzone_idx` ON `aircraft` (`dropzone_id`);--> statement-breakpoint
CREATE TABLE `booking_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`date` text,
	`weekday` integer,
	`time` text NOT NULL,
	`capacity` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_slots_unique` ON `booking_slots` (`dropzone_id`,`date`,`weekday`,`time`);--> statement-breakpoint
CREATE INDEX `booking_slots_dz_date_idx` ON `booking_slots` (`dropzone_id`,`date`);--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`checked_in_at` integer NOT NULL,
	`checked_in_by` text,
	`checked_out_at` integer,
	`checked_out_by` text,
	`weight_kg` real,
	`gear_rental` integer DEFAULT false NOT NULL,
	`rental_rig_id` text,
	`verified` integer DEFAULT false NOT NULL,
	`note` text,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checked_in_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checked_out_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rental_rig_id`) REFERENCES `rigs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_open_unique` ON `checkins` (`dropzone_id`,`user_id`) WHERE checked_out_at IS NULL;--> statement-breakpoint
CREATE INDEX `checkins_dz_day_idx` ON `checkins` (`dropzone_id`,`day`);--> statement-breakpoint
CREATE INDEX `checkins_user_idx` ON `checkins` (`user_id`);--> statement-breakpoint
CREATE TABLE `dropzone_follows` (
	`dropzone_id` text NOT NULL,
	`user_id` text NOT NULL,
	`favourite` integer DEFAULT false NOT NULL,
	`notify` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`dropzone_id`, `user_id`),
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dropzone_follows_user_idx` ON `dropzone_follows` (`user_id`);--> statement-breakpoint
CREATE TABLE `dropzone_member_roles` (
	`dropzone_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`colour` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`dropzone_id`, `user_id`, `role`),
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dropzone_member_roles_user_idx` ON `dropzone_member_roles` (`user_id`);--> statement-breakpoint
CREATE INDEX `dropzone_member_roles_role_idx` ON `dropzone_member_roles` (`dropzone_id`,`role`);--> statement-breakpoint
CREATE TABLE `dropzone_payment_configs` (
	`dropzone_id` text PRIMARY KEY NOT NULL,
	`stripe_account_id` text,
	`stripe_country` text,
	`stripe_currency` text,
	`stripe_onboarded` integer DEFAULT false NOT NULL,
	`stripe_charges_enabled` integer DEFAULT false NOT NULL,
	`stripe_payouts_enabled` integer DEFAULT false NOT NULL,
	`payfast_merchant_id` text,
	`payfast_merchant_key_enc` text,
	`payfast_passphrase_enc` text,
	`payfast_sandbox` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dropzone_subscriptions` (
	`dropzone_id` text PRIMARY KEY NOT NULL,
	`plan` text DEFAULT 'trial' NOT NULL,
	`status` text DEFAULT 'trialing' NOT NULL,
	`provider` text,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`price_minor` integer,
	`currency` text,
	`interval` text,
	`started_at` integer,
	`current_period_end` integer,
	`trial_ends_at` integer,
	`cancel_at` integer,
	`ended_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `federation_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `federation_outbox_pending_idx` ON `federation_outbox` (`sent_at`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`purpose` text DEFAULT 'other' NOT NULL,
	`owner_user_id` text,
	`dropzone_id` text,
	`sha256` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_key_unique` ON `files` (`key`);--> statement-breakpoint
CREATE INDEX `files_owner_idx` ON `files` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `files_dropzone_idx` ON `files` (`dropzone_id`);--> statement-breakpoint
CREATE TABLE `gear_service_events` (
	`id` text PRIMARY KEY NOT NULL,
	`rig_id` text NOT NULL,
	`kind` text NOT NULL,
	`performed_on` text NOT NULL,
	`performed_by_user_id` text,
	`performed_by_name` text,
	`rigger_number` text,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`rig_id`) REFERENCES `rigs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`performed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `gear_service_events_rig_idx` ON `gear_service_events` (`rig_id`,`performed_on`);--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text DEFAULT 'jumpmaster' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`counts` text DEFAULT '{}' NOT NULL,
	`log` text DEFAULT '[]' NOT NULL,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_jobs_user_idx` ON `import_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `indemnity_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`audience` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `indemnity_sections_dz_audience_idx` ON `indemnity_sections` (`dropzone_id`,`audience`,`position`);--> statement-breakpoint
CREATE TABLE `indemnity_signatures` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`audience` text NOT NULL,
	`user_id` text,
	`tandem_passenger_id` text,
	`signer_name` text NOT NULL,
	`signature_file_id` text,
	`guardian_name` text,
	`guardian_signature_file_id` text,
	`pdf_file_id` text,
	`snapshot` text NOT NULL,
	`signed_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tandem_passenger_id`) REFERENCES `tandem_passengers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`signature_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`guardian_signature_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pdf_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `indemnity_signatures_dz_user_idx` ON `indemnity_signatures` (`dropzone_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `indemnity_signatures_tandem_idx` ON `indemnity_signatures` (`tandem_passenger_id`);--> statement-breakpoint
CREATE TABLE `instances` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text,
	`name` text NOT NULL,
	`origin` text NOT NULL,
	`redirect_uris` text DEFAULT '[]' NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_hash` text NOT NULL,
	`public_key_jwk` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instances_client_id_unique` ON `instances` (`client_id`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`dropzone_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`available_after_minor` integer NOT NULL,
	`pending_after_minor` integer NOT NULL,
	`slot_id` text,
	`load_id` text,
	`related_entry_id` text,
	`provider` text,
	`provider_tx_id` text,
	`origin` text,
	`reason` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `wallet_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`related_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_account_idx` ON `ledger_entries` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ledger_entries_slot_idx` ON `ledger_entries` (`slot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_provider_tx_unique` ON `ledger_entries` (`provider`,`provider_tx_id`);--> statement-breakpoint
CREATE TABLE `linked_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`refresh_token_enc` text,
	`scopes` text,
	`linked_at` integer NOT NULL,
	`last_sync_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linked_accounts_issuer_subject_unique` ON `linked_accounts` (`issuer`,`subject`);--> statement-breakpoint
CREATE INDEX `linked_accounts_user_idx` ON `linked_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `loads` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`day` text NOT NULL,
	`load_number` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`is_open` integer DEFAULT false NOT NULL,
	`aircraft_id` text,
	`aircraft_name` text,
	`capacity` integer NOT NULL,
	`weight_limit_kg` real,
	`pilot_user_id` text,
	`pilot_name` text,
	`pilot_weight_kg` real,
	`pilot_pay_minor` integer DEFAULT 0 NOT NULL,
	`requirements` text,
	`scheduled_at` integer,
	`call_started_at` integer,
	`call_due_at` integer,
	`boarding_at` integer,
	`departed_at` integer,
	`landed_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	`refuel` integer DEFAULT false NOT NULL,
	`shutdown_minutes` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`aircraft_id`) REFERENCES `aircraft`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pilot_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loads_dz_day_number_unique` ON `loads` (`dropzone_id`,`day`,`load_number`);--> statement-breakpoint
CREATE INDEX `loads_dz_status_idx` ON `loads` (`dropzone_id`,`status`);--> statement-breakpoint
CREATE TABLE `logbook_jumps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`jump_number` integer NOT NULL,
	`jump_date` text NOT NULL,
	`dropzone_id` text,
	`location` text,
	`aircraft` text,
	`altitude_ft` integer,
	`freefall_seconds` integer,
	`jump_type` text,
	`description` text,
	`rig_id` text,
	`signer_user_id` text,
	`signer_name` text,
	`signer_licence` text,
	`signature_file_id` text,
	`signed_at` integer,
	`verified` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`slot_id` text,
	`load_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rig_id`) REFERENCES `rigs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`signer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`signature_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `logbook_jumps_user_number_idx` ON `logbook_jumps` (`user_id`,`jump_number`);--> statement-breakpoint
CREATE INDEX `logbook_jumps_user_date_idx` ON `logbook_jumps` (`user_id`,`jump_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `logbook_jumps_user_source_ref_unique` ON `logbook_jumps` (`user_id`,`source`,`source_ref`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dropzone_id` text,
	`type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`actor_user_id` text,
	`read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read`,`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`user_id` text,
	`tandem_passenger_id` text,
	`purpose` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`provider_ref` text,
	`provider_event_id` text,
	`slot_ids` text DEFAULT '[]' NOT NULL,
	`ledger_entry_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tandem_passenger_id`) REFERENCES `tandem_passengers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payments_dz_idx` ON `payments` (`dropzone_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_event_unique` ON `payments` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE TABLE `pricelist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`code` text NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`label` text,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricelist_items_dz_code_unique` ON `pricelist_items` (`dropzone_id`,`code`);--> statement-breakpoint
CREATE TABLE `rigs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'personal' NOT NULL,
	`user_id` text,
	`dropzone_id` text,
	`name` text,
	`container` text,
	`main_canopy` text,
	`main_size_sqft` integer,
	`wing_loading` real,
	`reserve_canopy` text,
	`reserve_size_sqft` integer,
	`reserve_repacked_on` text,
	`repack_interval_days` integer,
	`aad` text,
	`aad_serial` text,
	`aad_service_due_on` text,
	`aad_expires_on` text,
	`wingsuit` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`source_ref` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rigs_user_idx` ON `rigs` (`user_id`);--> statement-breakpoint
CREATE INDEX `rigs_dropzone_idx` ON `rigs` (`dropzone_id`);--> statement-breakpoint
CREATE TABLE `slots` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`load_id` text NOT NULL,
	`user_id` text,
	`display_name` text NOT NULL,
	`email` text,
	`licence` text,
	`weight_kg` real DEFAULT 0 NOT NULL,
	`jump_type` text NOT NULL,
	`group_id` text,
	`team_id` text,
	`team_name` text,
	`tandem_passenger_id` text,
	`staff_role` text,
	`is_load_master` integer DEFAULT false NOT NULL,
	`extras` text DEFAULT '[]' NOT NULL,
	`base_override_minor` integer,
	`price_breakdown` text DEFAULT '[]' NOT NULL,
	`deposit_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`paid_at` integer,
	`paid_via` text,
	`wallet_hold_id` text,
	`staff_pay_minor` integer DEFAULT 0 NOT NULL,
	`note` text,
	`colour` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tandem_passenger_id`) REFERENCES `tandem_passengers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`wallet_hold_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `slots_load_idx` ON `slots` (`load_id`);--> statement-breakpoint
CREATE INDEX `slots_user_paid_idx` ON `slots` (`user_id`,`paid`);--> statement-breakpoint
CREATE INDEX `slots_dz_idx` ON `slots` (`dropzone_id`);--> statement-breakpoint
CREATE INDEX `slots_group_idx` ON `slots` (`group_id`);--> statement-breakpoint
CREATE INDEX `slots_tandem_idx` ON `slots` (`tandem_passenger_id`);--> statement-breakpoint
CREATE TABLE `tandem_passengers` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text NOT NULL,
	`confirmation_number` text NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`id_number` text,
	`gender` text,
	`dob` text,
	`nationality` text,
	`height_cm` real,
	`weight_kg` real,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`postal_code` text,
	`country` text,
	`guardian_name` text,
	`guardian_email` text,
	`guardian_id_number` text,
	`emergency_name` text,
	`emergency_email` text,
	`emergency_phone` text,
	`emergency_address_line1` text,
	`emergency_address_line2` text,
	`emergency_city` text,
	`emergency_postal_code` text,
	`emergency_country` text,
	`jump_date` text,
	`booking_slot_id` text,
	`booking_time` text,
	`extras` text DEFAULT '[]' NOT NULL,
	`heard_from` text,
	`note` text,
	`indemnity_signature_id` text,
	`indemnity_signed_at` integer,
	`pdf_file_id` text,
	`currency` text NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`deposit_minor` integer DEFAULT 0 NOT NULL,
	`amount_paid_minor` integer DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`payment_method` text,
	`paid_at` integer,
	`online_booking` integer DEFAULT false NOT NULL,
	`manifested` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`source_ref` text,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_slot_id`) REFERENCES `booking_slots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`indemnity_signature_id`) REFERENCES `indemnity_signatures`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pdf_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tandem_passengers_confirmation_unique` ON `tandem_passengers` (`confirmation_number`);--> statement-breakpoint
CREATE INDEX `tandem_passengers_dz_status_date_idx` ON `tandem_passengers` (`dropzone_id`,`status`,`jump_date`);--> statement-breakpoint
CREATE INDEX `tandem_passengers_booking_slot_idx` ON `tandem_passengers` (`booking_slot_id`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`team_id`, `user_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_members_user_idx` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`dropzone_id` text,
	`owner_user_id` text,
	`name` text NOT NULL,
	`discipline` text,
	`colour` text,
	`coach_user_id` text,
	`video_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`video_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `teams_dropzone_idx` ON `teams` (`dropzone_id`);--> statement-breakpoint
CREATE INDEX `teams_owner_idx` ON `teams` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `user_buddies` (
	`user_id` text NOT NULL,
	`buddy_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `buddy_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`buddy_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_buddies_buddy_idx` ON `user_buddies` (`buddy_id`);--> statement-breakpoint
CREATE TABLE `user_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`rating` text NOT NULL,
	`value` text,
	`expires_on` text,
	`verified_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_ratings_unique` ON `user_ratings` (`user_id`,`body`,`rating`);--> statement-breakpoint
CREATE TABLE `wallet_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dropzone_id` text NOT NULL,
	`currency` text NOT NULL,
	`available_minor` integer DEFAULT 0 NOT NULL,
	`pending_minor` integer DEFAULT 0 NOT NULL,
	`lifetime_topup_minor` integer DEFAULT 0 NOT NULL,
	`lifetime_spent_minor` integer DEFAULT 0 NOT NULL,
	`last_activity_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dropzone_id`) REFERENCES `dropzones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_accounts_user_dz_unique` ON `wallet_accounts` (`user_id`,`dropzone_id`);--> statement-breakpoint
ALTER TABLE `dropzones` ADD `description` text;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `photo_file_id` text REFERENCES files(id);--> statement-breakpoint
ALTER TABLE `dropzones` ADD `open_days` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `open_time` text;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `close_time` text;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `listed` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `payments_on` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `wallet_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `wallet_allow_negative` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `pay_at_manifest` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `email_notices` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `indemnity_tandem_active` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `indemnity_sport_active` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `repack_interval_days` integer;--> statement-breakpoint
ALTER TABLE `dropzones` ADD `source_ref` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_file_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `address` text;--> statement-breakpoint
ALTER TABLE `users` ADD `dob` text;--> statement-breakpoint
ALTER TABLE `users` ADD `emergency_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `emergency_phone` text;--> statement-breakpoint
ALTER TABLE `users` ADD `marketing_opt_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `association` text;--> statement-breakpoint
ALTER TABLE `users` ADD `association_number` text;--> statement-breakpoint
ALTER TABLE `users` ADD `association_expiry` text;--> statement-breakpoint
ALTER TABLE `users` ADD `association_verified_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `licence` text;--> statement-breakpoint
ALTER TABLE `users` ADD `declared_jump_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `weight_kg` real;--> statement-breakpoint
ALTER TABLE `users` ADD `loading_weight_kg` real;--> statement-breakpoint
ALTER TABLE `users` ADD `is_super_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `source_ref` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_source_ref_unique` ON `users` (`source_ref`);--> statement-breakpoint
-- Data migration: single role per member → dropzone_member_roles (hand-added).
INSERT OR IGNORE INTO `dropzone_member_roles` (`dropzone_id`, `user_id`, `role`, `created_at`) SELECT `dropzone_id`, `user_id`, `role`, `created_at` FROM `dropzone_members`;--> statement-breakpoint
ALTER TABLE `dropzone_members` DROP COLUMN `role`;