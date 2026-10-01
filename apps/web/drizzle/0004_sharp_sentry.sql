-- Passage au multi-utilisateur.
--
-- `user_id` est ajoutee NOT NULL sans valeur par defaut : la migration suppose
-- donc `entries` et `food_aliases` vides, ce qui etait le cas au moment de
-- l'ecrire. Appliquee a une base deja peuplee, elle echouerait. Il faudrait
-- alors creer un compte de reprise, ajouter la colonne en nullable, affecter
-- les lignes existantes a ce compte, puis poser la contrainte.
--
-- L'unicite des alias passe du seul nom au couple (utilisateur, nom) : deux
-- personnes n'associent pas forcement le meme mot au meme aliment.

CREATE TABLE "profiles" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"sex" text NOT NULL,
	"birth_date" date NOT NULL,
	"height_cm" integer NOT NULL,
	"weight_kg" numeric(5, 1) NOT NULL,
	"body_fat_percent" numeric(4, 1),
	"activity" text NOT NULL,
	"goal" text NOT NULL,
	"rate_percent_per_week" numeric(3, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "food_aliases" DROP CONSTRAINT "food_aliases_alias_norm_unique";--> statement-breakpoint
DROP INDEX "entries_entry_date_idx";--> statement-breakpoint
DROP INDEX "entries_source_idx";--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "user_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "food_aliases" ADD COLUMN "user_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_user_date_idx" ON "entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "entries_user_source_idx" ON "entries" USING btree ("user_id","source_kind","source_ref","created_at");--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_user_alias_key" UNIQUE("user_id","alias_norm");