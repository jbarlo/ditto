CREATE TABLE `album` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`owner_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `album_canvas` (
	`album_id` text NOT NULL,
	`canvas_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`album_id`, `canvas_id`),
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`canvas_id`) REFERENCES `canvas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_album_canvas_position` ON `album_canvas` (`album_id`,`position`);--> statement-breakpoint
CREATE TABLE `canvas` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `canvas_user` (
	`canvas_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'owner',
	`added_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`canvas_id`, `user_id`),
	FOREIGN KEY (`canvas_id`) REFERENCES `canvas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `frame` (
	`id` text PRIMARY KEY NOT NULL,
	`friendly_id` text NOT NULL,
	`mac_address` text NOT NULL,
	`api_key` text NOT NULL,
	`name` text COLLATE NOCASE,
	`owner_id` text,
	`current_album_id` text,
	`current_index` integer DEFAULT 0,
	`claimed_at` text,
	`last_seen_at` text,
	`battery_voltage` real,
	`firmware_version` text,
	`rssi` integer,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`owner_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frame_friendly_id_unique` ON `frame` (`friendly_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `frame_mac_address_unique` ON `frame` (`mac_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `frame_api_key_unique` ON `frame` (`api_key`);--> statement-breakpoint
CREATE INDEX `idx_frame_mac` ON `frame` (`mac_address`);--> statement-breakpoint
CREATE INDEX `idx_frame_api_key` ON `frame` (`api_key`);--> statement-breakpoint
CREATE INDEX `idx_frame_friendly_id` ON `frame` (`friendly_id`);--> statement-breakpoint
CREATE INDEX `idx_frame_owner_name` ON `frame` (`owner_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `frame_owner_name_unique` ON `frame` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL
);
