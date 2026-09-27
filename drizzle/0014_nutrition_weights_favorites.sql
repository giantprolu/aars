CREATE TABLE "favorite_meals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"meal" text NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_meals_meal_check" CHECK ("favorite_meals"."meal" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE TABLE "weight_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"day" date NOT NULL,
	"weight_kg" numeric(5, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weight_logs_user_day_key" UNIQUE("user_id","day"),
	CONSTRAINT "weight_logs_weight_check" CHECK ("weight_logs"."weight_kg" between 30 and 300)
);
--> statement-breakpoint
ALTER TABLE "favorite_meals" ADD CONSTRAINT "favorite_meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorite_meals_user_idx" ON "favorite_meals" USING btree ("user_id","created_at");