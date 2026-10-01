CREATE TABLE "ciqual_foods" (
	"ciqual_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kcal_100g" numeric(10, 3),
	"protein_100g" numeric(10, 3),
	"carbs_100g" numeric(10, 3),
	"fat_100g" numeric(10, 3),
	"is_complete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_aliases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"alias_norm" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_ref" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_aliases_alias_norm_unique" UNIQUE("alias_norm")
);
