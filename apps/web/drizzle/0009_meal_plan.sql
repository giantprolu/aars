CREATE TABLE "meal_plan_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"plan_date" date NOT NULL,
	"meal" text NOT NULL,
	"recipe_id" bigint NOT NULL,
	"servings" numeric(4, 1) DEFAULT '1' NOT NULL,
	"journaled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_plan_meal_check" CHECK ("meal_plan_entries"."meal" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_plan_user_date_idx" ON "meal_plan_entries" USING btree ("user_id","plan_date");