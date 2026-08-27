ALTER TABLE "print_job" ALTER COLUMN "printer_job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "print_job" ADD COLUMN "gateway_job_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "print_job_gateway_job_key_idx" ON "print_job" USING btree ("gateway_job_key");