CREATE TABLE "entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_date" date NOT NULL,
	"food_label" text NOT NULL,
	"quantity_g" numeric(10, 3) NOT NULL,
	"kcal" numeric(10, 3) NOT NULL,
	"protein_g" numeric(10, 3) NOT NULL,
	"carbs_g" numeric(10, 3) NOT NULL,
	"fat_g" numeric(10, 3) NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "entries_entry_date_idx" ON "entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "entries_source_idx" ON "entries" USING btree ("source_kind","source_ref","created_at");