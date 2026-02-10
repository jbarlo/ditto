CREATE TABLE `canvas_invite` (
	`token` text PRIMARY KEY NOT NULL,
	`canvas_id` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`expires_at` text NOT NULL,
	FOREIGN KEY (`canvas_id`) REFERENCES `canvas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_canvas_invite_canvas` ON `canvas_invite` (`canvas_id`);