import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text().notNull().default("farmer"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const predictions = pgTable(
  "predictions",
  {
    id: serial().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    crop: text().notNull().default(""),
    disease: text().notNull(),
    scientific: text().notNull().default(""),
    level: text().notNull().default("unknown"),
    confidence: doublePrecision().notNull().default(0),
    predictions: jsonb().notNull().default([]),
    treatment: jsonb().notNull().default([]),
    imageKey: text("image_key"),
    reviewed: boolean().notNull().default(false),
    notes: text().notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("predictions_user_created_idx").on(t.userId, t.createdAt)]
);

// Server-side settings such as the generated JWT signing key.
export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});
