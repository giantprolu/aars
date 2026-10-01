CREATE TABLE "daily_activity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"day" date NOT NULL,
	"source" text NOT NULL,
	"active_kcal" numeric(7, 1) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_activity_user_day_source_key" UNIQUE("user_id","day","source")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ingest_token" text;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_activity_user_day_idx" ON "daily_activity" USING btree ("user_id","day");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ingest_token_unique" UNIQUE("ingest_token");