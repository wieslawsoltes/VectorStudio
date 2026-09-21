CREATE TABLE `project_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_project_created` ON `project_audit` (`project_id`,`created`);--> statement-breakpoint
CREATE TABLE `snapshot_chunks` (
	`project_id` text NOT NULL,
	`commit_id` text NOT NULL,
	`kind` text NOT NULL,
	`part` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`project_id`, `commit_id`, `kind`, `part`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`expires` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `update_receipts` (
	`project_id` text NOT NULL,
	`actor` text NOT NULL,
	`update_id` text NOT NULL,
	`hash` text NOT NULL,
	`revision` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`project_id`, `actor`, `update_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `sync_commit` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `retention` integer DEFAULT 40 NOT NULL;