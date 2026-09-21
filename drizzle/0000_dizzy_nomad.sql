CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`page_id` text NOT NULL,
	`x` integer DEFAULT 0 NOT NULL,
	`y` integer DEFAULT 0 NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_project_created` ON `comments` (`project_id`,`created`);--> statement-breakpoint
CREATE TABLE `members` (
	`project_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`project_id`, `email`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `members_email` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `presence` (
	`project_id` text NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`cursor` text NOT NULL,
	`page_id` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`project_id`, `client_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `presence_project_updated` ON `presence` (`project_id`,`updated`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`document` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner_updated` ON `projects` (`owner`,`updated`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`document` text NOT NULL,
	`author` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`project_id`, `revision`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
