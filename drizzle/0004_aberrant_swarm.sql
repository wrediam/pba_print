ALTER TABLE "print_job" ADD COLUMN "paper_type" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "computer_name" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "output_mode" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "staple" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "staple_count" integer;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "punch" text;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "punch_count" integer;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "completed_sets" integer;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "completed_pages" integer;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "original_count" integer;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "original_size" text;