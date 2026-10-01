CREATE TABLE "favorite_exercises" (
	"user_id" bigint NOT NULL,
	"exercise_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_exercises_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "kind" text DEFAULT 'program' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "source_session_id" bigint;--> statement-breakpoint
ALTER TABLE "favorite_exercises" ADD CONSTRAINT "favorite_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_exercises" ADD CONSTRAINT "favorite_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_kind_check" CHECK ("workout_templates"."kind" in ('program', 'custom', 'adhoc'));