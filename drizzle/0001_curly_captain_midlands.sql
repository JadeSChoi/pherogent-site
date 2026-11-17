CREATE TABLE `mcp_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`reserved_fetches` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mcp_requests_day` ON `mcp_requests` (`day`);--> statement-breakpoint
CREATE INDEX `mcp_requests_user_day` ON `mcp_requests` (`user_id`,`day`);