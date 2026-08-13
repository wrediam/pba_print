ALTER TABLE "print_job" RENAME COLUMN "full_code" TO "login_name";--> statement-breakpoint
ALTER TABLE "print_job" RENAME COLUMN "computer_name" TO "user_name";--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "full_color_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "two_color_count" integer;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "single_color_count" integer;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "error_cause" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "direct_address" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "color_setting" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "paper_size" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "duplex_setup" text;