CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"crop" text DEFAULT '' NOT NULL,
	"disease" text NOT NULL,
	"scientific" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'unknown' NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"predictions" jsonb DEFAULT '[]' NOT NULL,
	"treatment" jsonb DEFAULT '[]' NOT NULL,
	"image_key" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'farmer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "predictions_user_created_idx" ON "predictions" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;