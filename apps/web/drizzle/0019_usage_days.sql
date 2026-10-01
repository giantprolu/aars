CREATE TABLE "usage_days" (
	"user_id" bigint NOT NULL,
	"day" date NOT NULL,
	"event" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "usage_days_user_id_day_event_pk" PRIMARY KEY("user_id","day","event"),
	CONSTRAINT "usage_days_event_check" CHECK ("usage_days"."event" in ('app_opened', 'target_set', 'activity_synced', 'paywall_hit', 'meal_search', 'meal_barcode', 'meal_photo', 'meal_manual', 'meal_recent', 'meal_favorite', 'meal_recipe', 'meal_planned'))
);
--> statement-breakpoint
ALTER TABLE "usage_days" ADD CONSTRAINT "usage_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_days_day_idx" ON "usage_days" USING btree ("day","event");