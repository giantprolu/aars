CREATE TABLE "moderation_audit" (
	"id" bigint PRIMARY KEY DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"event" text NOT NULL,
	"case_id" bigint,
	"user_id" bigint,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text,
	"hash" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_cases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_user_id" bigint NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" bigint NOT NULL,
	"category" text,
	"severity" text,
	"risk_score" numeric(4, 3) DEFAULT '0' NOT NULL,
	"level" text DEFAULT 'safe' NOT NULL,
	"priority" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommended_action" text,
	"content_snapshot" text,
	"policy_version" text NOT NULL,
	"assigned_to" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "moderation_cases_target_kind_check" CHECK ("moderation_cases"."target_kind" in ('user', 'session', 'template_name', 'exercise_name')),
	CONSTRAINT "moderation_cases_status_check" CHECK ("moderation_cases"."status" in ('open', 'triaged', 'under_review', 'action_taken', 'dismissed', 'appealed', 'resolved')),
	CONSTRAINT "moderation_cases_priority_check" CHECK ("moderation_cases"."priority" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "moderation_sanctions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"case_id" bigint,
	"kind" text NOT NULL,
	"action" text NOT NULL,
	"category" text,
	"severity" text,
	"strike_weight" numeric(5, 2) DEFAULT '0' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by" text,
	"lift_reason" text,
	"voided" boolean DEFAULT false NOT NULL,
	"decided_by" text NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_sanctions_kind_check" CHECK ("moderation_sanctions"."kind" in ('strike', 'warning', 'restriction', 'suspension', 'ban'))
);
--> statement-breakpoint
CREATE TABLE "moderation_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" bigint NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"category" text,
	"severity" text,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"signals" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_hits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_reports" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "social_reports" ADD COLUMN "case_id" bigint;--> statement-breakpoint
ALTER TABLE "social_reports" ADD COLUMN "weight" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "name_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "name_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_sanctions" ADD CONSTRAINT "moderation_sanctions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_sanctions" ADD CONSTRAINT "moderation_sanctions_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_signals" ADD CONSTRAINT "moderation_signals_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_audit_case_idx" ON "moderation_audit" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "moderation_audit_user_idx" ON "moderation_audit" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "moderation_cases_queue_idx" ON "moderation_cases" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "moderation_cases_subject_idx" ON "moderation_cases" USING btree ("subject_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_cases_open_target_idx" ON "moderation_cases" USING btree ("target_kind","target_id") WHERE status in ('open', 'triaged', 'under_review', 'appealed');--> statement-breakpoint
CREATE INDEX "moderation_sanctions_user_idx" ON "moderation_sanctions" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "moderation_sanctions_case_idx" ON "moderation_sanctions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "moderation_signals_case_idx" ON "moderation_signals" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_expires_idx" ON "rate_limit_hits" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_reports_target_idx" ON "social_reports" USING btree ("reported_user_id","created_at");--> statement-breakpoint
ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_status_check" CHECK ("social_reports"."status" is null or "social_reports"."status" in ('open', 'triaged', 'under_review', 'action_taken', 'dismissed', 'appealed', 'resolved'));--> statement-breakpoint
-- Journal d'audit en ajout seul (écrit à la main, drizzle-kit ne génère pas de déclencheur).
-- Chaque ligne reçoit son numéro sous verrou, puis l'empreinte de la précédente :
-- la chaîne suit l'ordre des numéros, même avec deux écritures simultanées.
CREATE FUNCTION "moderation_audit_chain"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous_id bigint;
  previous_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('moderation_audit'));
  SELECT "id", "hash" INTO previous_id, previous_hash FROM "moderation_audit" ORDER BY "id" DESC LIMIT 1;
  NEW."id" := coalesce(previous_id, 0) + 1;
  NEW."at" := now();
  NEW."prev_hash" := previous_hash;
  NEW."hash" := encode(sha256(convert_to(concat_ws('|',
    coalesce(previous_hash, ''),
    NEW."id"::text,
    to_char(NEW."at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    NEW."actor",
    NEW."event",
    coalesce(NEW."case_id"::text, ''),
    coalesce(NEW."user_id"::text, ''),
    NEW."details"::text
  ), 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Aucune modification ; une suppression seulement au-delà d'un an (AUDIT_MIN_DAYS),
-- pour la purge de conservation.
CREATE FUNCTION "moderation_audit_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."at" < now() - interval '365 days' THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'moderation_audit est en ajout seul (%)', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "moderation_audit_chain" BEFORE INSERT ON "moderation_audit" FOR EACH ROW EXECUTE FUNCTION "moderation_audit_chain"();
--> statement-breakpoint
CREATE TRIGGER "moderation_audit_guard" BEFORE UPDATE OR DELETE ON "moderation_audit" FOR EACH ROW EXECUTE FUNCTION "moderation_audit_guard"();
--> statement-breakpoint
CREATE TRIGGER "moderation_audit_no_truncate" BEFORE TRUNCATE ON "moderation_audit" FOR EACH STATEMENT EXECUTE FUNCTION "moderation_audit_guard"();
