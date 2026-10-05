CREATE TABLE "store_purchases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"store" text NOT NULL,
	"product_id" text NOT NULL,
	"purchase_token" text NOT NULL,
	"state" text NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_purchases_purchase_token_unique" UNIQUE("purchase_token"),
	CONSTRAINT "store_purchases_store_check" CHECK ("store_purchases"."store" in ('google_play', 'app_store')),
	CONSTRAINT "store_purchases_state_check" CHECK ("store_purchases"."state" in ('purchased', 'pending', 'refunded'))
);
--> statement-breakpoint
ALTER TABLE "store_subscriptions" DROP CONSTRAINT "store_subscriptions_store_check";--> statement-breakpoint
ALTER TABLE "store_purchases" ADD CONSTRAINT "store_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_purchases_user_idx" ON "store_purchases" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_store_check" CHECK ("store_subscriptions"."store" in ('google_play', 'app_store'));