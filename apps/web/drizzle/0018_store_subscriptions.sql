CREATE TABLE "store_subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"store" text DEFAULT 'google_play' NOT NULL,
	"product_id" text NOT NULL,
	"purchase_token" text NOT NULL,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone,
	"auto_renewing" boolean DEFAULT false NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_subscriptions_purchase_token_unique" UNIQUE("purchase_token"),
	CONSTRAINT "store_subscriptions_store_check" CHECK ("store_subscriptions"."store" in ('google_play'))
);
--> statement-breakpoint
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_subscriptions_user_idx" ON "store_subscriptions" USING btree ("user_id","expires_at");