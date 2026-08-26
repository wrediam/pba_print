CREATE TABLE "gateway_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"queue_name" text NOT NULL,
	"full_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_provisioned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gateway_queue" ADD CONSTRAINT "gateway_queue_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_queue" ADD CONSTRAINT "gateway_queue_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_queue_person_dept_idx" ON "gateway_queue" USING btree ("person_id","department_id");