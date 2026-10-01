CREATE TABLE "gym_exercises" (
	"gym_id" bigint NOT NULL,
	"exercise_id" bigint NOT NULL,
	CONSTRAINT "gym_exercises_gym_id_exercise_id_pk" PRIMARY KEY("gym_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gyms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "training_preferences" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"gym_id" bigint,
	"focus" text DEFAULT 'full' NOT NULL,
	"equipment" text DEFAULT 'any' NOT NULL,
	"sessions_per_week" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_preferences_focus_check" CHECK ("training_preferences"."focus" in ('upper', 'lower', 'full')),
	CONSTRAINT "training_preferences_equipment_check" CHECK ("training_preferences"."equipment" in ('free', 'machine', 'any')),
	CONSTRAINT "training_preferences_sessions_check" CHECK ("training_preferences"."sessions_per_week" between 2 and 6)
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "region" text DEFAULT 'upper' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "equipment" text DEFAULT 'machine' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "rank" integer;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "aliases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "to_failure" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gym_exercises" ADD CONSTRAINT "gym_exercises_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_exercises" ADD CONSTRAINT "gym_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_preferences" ADD CONSTRAINT "training_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_preferences" ADD CONSTRAINT "training_preferences_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_group_idx" ON "exercises" USING btree ("muscle_group","rank");--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_region_check" CHECK ("exercises"."region" in ('upper', 'lower', 'core', 'full'));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_equipment_check" CHECK ("exercises"."equipment" in ('free', 'machine', 'cable', 'bodyweight', 'cardio'));