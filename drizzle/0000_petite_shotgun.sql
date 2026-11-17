CREATE TABLE `ai_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`reserved_micros` integer NOT NULL,
	`usage_json` text,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runs_user_request` ON `ai_runs` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `ai_runs_day` ON `ai_runs` (`day`);--> statement-breakpoint
CREATE INDEX `ai_runs_user_created` ON `ai_runs` (`user_id`,`created_at`);