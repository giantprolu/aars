CREATE TABLE "products" (
	"barcode" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kcal_100g" numeric(10, 3) NOT NULL,
	"protein_100g" numeric(10, 3) NOT NULL,
	"carbs_100g" numeric(10, 3) NOT NULL,
	"fat_100g" numeric(10, 3) NOT NULL,
	"serving_size_g" numeric(10, 3),
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");