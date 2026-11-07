ALTER TABLE `session` ADD `country` text;--> statement-breakpoint
ALTER TABLE `user` ADD `two_factor_secret` text;--> statement-breakpoint
ALTER TABLE `user` ADD `two_factor_always` integer DEFAULT false NOT NULL;