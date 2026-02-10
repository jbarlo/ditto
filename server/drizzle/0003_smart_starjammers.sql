PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_canvas_user` (
	`canvas_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'owner',
	`added_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`canvas_id`, `user_id`),
	FOREIGN KEY (`canvas_id`) REFERENCES `canvas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_canvas_user`("canvas_id", "user_id", "role", "added_at") SELECT "canvas_id", "user_id", "role", "added_at" FROM `canvas_user`;--> statement-breakpoint
DROP TABLE `canvas_user`;--> statement-breakpoint
ALTER TABLE `__new_canvas_user` RENAME TO `canvas_user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;