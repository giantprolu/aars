CREATE TABLE "recipe_ingredients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"recipe_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"ref_kind" text NOT NULL,
	"ref_value" text NOT NULL,
	"label" text NOT NULL,
	"quantity_g" numeric(10, 3) NOT NULL,
	"unit_name" text,
	"unit_grams" numeric(10, 3),
	CONSTRAINT "recipe_ingredients_ref_kind_check" CHECK ("recipe_ingredients"."ref_kind" in ('ciqual', 'product'))
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"servings" numeric(4, 1) DEFAULT '1' NOT NULL,
	"steps" text[] DEFAULT '{}'::text[] NOT NULL,
	"prep_minutes" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ciqual_foods" ADD COLUMN "group_code" text;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_idx" ON "recipe_ingredients" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipes_user_name_idx" ON "recipes" USING btree ("user_id","name");