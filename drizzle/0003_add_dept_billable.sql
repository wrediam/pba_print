ALTER TABLE "department" ADD COLUMN "billable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- USB Scans (dept 62) are scan-only jobs -- no toner or paper consumed for
-- printing, so they are excluded from billing reports by default.
UPDATE "department" SET "billable" = false WHERE "code" = '62';