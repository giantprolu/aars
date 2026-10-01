ALTER TABLE "entries" ADD COLUMN "meal" text DEFAULT 'lunch' NOT NULL;--> statement-breakpoint
UPDATE "entries" SET "meal" = CASE
  WHEN extract(hour from "created_at" at time zone 'Europe/Paris') < 11 THEN 'breakfast'
  WHEN extract(hour from "created_at" at time zone 'Europe/Paris') < 15 THEN 'lunch'
  WHEN extract(hour from "created_at" at time zone 'Europe/Paris') < 18 THEN 'snack'
  ELSE 'dinner'
END;--> statement-breakpoint
CREATE INDEX "entries_user_date_meal_idx" ON "entries" USING btree ("user_id","entry_date","meal");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_meal_check" CHECK ("entries"."meal" in ('breakfast', 'lunch', 'dinner', 'snack'));
