CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`bytes` blob NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`mime` text NOT NULL
);
