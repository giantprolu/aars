CREATE TABLE "catalog_meals" (
	"slug" text PRIMARY KEY NOT NULL,
	"goal" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"slot" text NOT NULL,
	"servings" integer NOT NULL,
	"prep_minutes" integer NOT NULL,
	"steps" text[] DEFAULT '{}'::text[] NOT NULL,
	"ingredients" jsonb NOT NULL,
	"estimate_kcal" integer NOT NULL,
	"estimate_protein_g" integer NOT NULL,
	CONSTRAINT "catalog_meals_goal_check" CHECK ("catalog_meals"."goal" in ('lose', 'maintain', 'gain')),
	CONSTRAINT "catalog_meals_slot_check" CHECK ("catalog_meals"."slot" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE INDEX "catalog_meals_goal_position_idx" ON "catalog_meals" USING btree ("goal","position");