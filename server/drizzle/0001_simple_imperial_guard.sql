CREATE TABLE `stroke` (
	`id` text PRIMARY KEY NOT NULL,
	`canvas_id` text NOT NULL,
	`user_id` text,
	`data` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`canvas_id`) REFERENCES `canvas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_stroke_canvas_created` ON `stroke` (`canvas_id`,`created_at`);
