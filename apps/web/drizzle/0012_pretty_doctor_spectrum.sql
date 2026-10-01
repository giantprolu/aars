CREATE TABLE "meal_basket" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"week_start" date NOT NULL,
	"recipe_id" bigint NOT NULL,
	"servings" numeric(4, 1) DEFAULT '2' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_basket_unique_key" UNIQUE("user_id","week_start","recipe_id")
);
--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "catalog_slug" text;--> statement-breakpoint
ALTER TABLE "meal_basket" ADD CONSTRAINT "meal_basket_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_basket" ADD CONSTRAINT "meal_basket_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_basket_user_week_idx" ON "meal_basket" USING btree ("user_id","week_start");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_catalog_slug_key" UNIQUE("user_id","catalog_slug");