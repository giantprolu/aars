CREATE TABLE "ingredient_products" (
	"user_id" bigint NOT NULL,
	"ingredient_key" text NOT NULL,
	"barcode" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_products_user_id_ingredient_key_pk" PRIMARY KEY("user_id","ingredient_key")
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"list_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"ref_kind" text NOT NULL,
	"ref_value" text NOT NULL,
	"label" text NOT NULL,
	"quantity_g" numeric(10, 3) NOT NULL,
	"aisle" text NOT NULL,
	"unit_name" text,
	"unit_grams" numeric(10, 3),
	"checked_at" timestamp with time zone,
	"checked_barcode" text,
	"added_manually" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shopping_items_ref_kind_check" CHECK ("shopping_items"."ref_kind" in ('ciqual', 'product'))
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_products" ADD CONSTRAINT "ingredient_products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_items_list_idx" ON "shopping_items" USING btree ("list_id","aisle");--> statement-breakpoint
CREATE INDEX "shopping_items_user_idx" ON "shopping_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_lists_user_idx" ON "shopping_lists" USING btree ("user_id","created_at");