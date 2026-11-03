CREATE TABLE `catalog` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ean` text NOT NULL,
	`image` text NOT NULL,
	`included` integer NOT NULL,
	`position` integer NOT NULL
);
