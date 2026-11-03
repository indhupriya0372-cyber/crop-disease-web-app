import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { avg, count, desc, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { db } from "../../db/index.js";
import { users, predictions, appSettings } from "../../db/schema.js";
import sampleManifest from "../../Data/samples/manifest.json" with { type: "json" };

type User = typeof users.$inferSelect;
type PredictionRow = typeof predictions.$inferSelect;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const LEVELS = ["healthy", "warning", "severe", "unknown"];

// Accounts advertised on the login page so the demo works on a fresh database.
const DEMO_ACCOUNTS = [
  { name: "Test Farmer", email: "testfarmer@example.com", password: "Farmer12345", role: "farmer" },
  { name: "Administrator", email: "admin@agricare.ai", password: "admin12345", role: "admin" },
];

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function photos() {
  return getStore({ name: "leaf-photos", consistency: "strong" });
}

/* ---------------- Secrets & seeding (once per function instance) ---------------- */

let secretPromise: Promise<Uint8Array> | null = null;

function getJwtSecret(): Promise<Uint8Array> {
  if (!secretPromise) {
    secretPromise = (async () => {
      const fromEnv = process.env.JWT_SECRET;
      if (fromEnv && fromEnv.length >= 32) {
        return new TextEncoder().encode(fromEnv);
      }
      // No secret configured: generate one and persist it so every
      // function instance signs and verifies with the same key.
      await db
        .insert(appSettings)
        .values({ key: "jwt_secret", value: randomBytes(48).toString("hex") })
        .onConflictDoNothing();
      const [row] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, "jwt_secret"));
      return new TextEncoder().encode(row.value);
    })().catch((error) => {
      secretPromise = null;
      throw error;
    });
  }
  return secretPromise;
}

let seedPromise: Promise<void> | null = null;

function ensureDemoAccounts(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      for (const account of DEMO_ACCOUNTS) {
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, account.email));
        if (existing.length) continue;
        await db
          .insert(users)
          .values({
            name: account.name,
            email: account.email,
            passwordHash: await bcrypt.hash(account.password, 10),
            role: account.role,
            isActive: true,
          })
          .onConflictDoNothing();
      }
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

/* ---------------- Auth helpers ---------------- */

async function createToken(user: User) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || "1d")
    .sign(await getJwtSecret());
}

function publicUser(user: User) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}

async function authenticate(req: Request, url: URL): Promise<User | null> {
  const header = req.headers.get("authorization") || "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // <img> tags cannot send headers, so photo URLs carry ?token=
  if (!token) token = url.searchParams.get("token") || "";
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, await getJwtSecret(), {
      algorithms: ["HS256"],
    });
    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return null;
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user && user.isActive ? user : null;
  } catch {
    return null;
  }
}

function validPassword(password: string) {
  return password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
}

/* ---------------- Record shaping ---------------- */

function toPublicPrediction(
  record: PredictionRow,
  owner?: { name: string; email: string } | null
) {
  return {
    id: String(record.id),
    userId: String(record.userId),
    user_name: owner ? owner.name : undefined,
    user_email: owner ? owner.email : undefined,
    crop: record.crop || "—",
    disease: record.disease,
    scientific: record.scientific || "",
    level: record.level || "unknown",
    confidence: record.confidence,
    treatment: Array.isArray(record.treatment) ? record.treatment : [],
    image_url: record.imageKey ? "/uploads/" + record.imageKey : null,
    reviewed: record.reviewed,
    notes: record.notes || "",
    created_at: record.createdAt,
  };
}

async function listPredictions(userId?: number) {
  const query = db
    .select({ record: predictions, name: users.name, email: users.email })
    .from(predictions)
    .innerJoin(users, eq(predictions.userId, users.id));
  const rows = await (userId === undefined
    ? query
    : query.where(eq(predictions.userId, userId))
  )
    .orderBy(desc(predictions.createdAt))
    .limit(500);
  return rows.map((row) =>
    toPublicPrediction(row.record, { name: row.name, email: row.email })
  );
}

/* ---------------- Route handlers ---------------- */

async function register(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, email, password } = body || {};

  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
    return json({ success: false, message: "Name, email and password are required" }, 400);
  }
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (cleanName.length < 2 || cleanName.length > 100) {
    return json({ success: false, message: "Name must contain 2 to 100 characters" }, 400);
  }
  if (cleanEmail.length > 254 || !EMAIL_RE.test(cleanEmail)) {
    return json({ success: false, message: "Please enter a valid email address" }, 400);
  }
  if (!validPassword(password)) {
    return json(
      { success: false, message: "Password must be at least 8 characters and at most 72 bytes" },
      400
    );
  }

  const [user] = await db
    .insert(users)
    .values({
      name: cleanName,
      email: cleanEmail,
      passwordHash: await bcrypt.hash(password, 10),
      role: "farmer",
      isActive: true,
    })
    .onConflictDoNothing()
    .returning();

  if (!user) {
    return json({ success: false, message: "An account with this email already exists" }, 409);
  }

  return json(
    {
      success: true,
      message: "Registration successful",
      token: await createToken(user),
      user: publicUser(user),
    },
    201
  );
}

async function login(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body || {};

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return json({ success: false, message: "Email and password are required" }, 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));

  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    return json({ success: false, message: "Invalid email or password" }, 401);
  }

  return json({
    success: true,
    message: "Login successful",
    token: await createToken(user),
    user: publicUser(user),
  });
}

/** Save a diagnosis (computed in the browser) together with the leaf photo. */
async function saveScan(req: Request, user: User) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected multipart form data" }, 400);
  }

  let list: any[];
  try {
    list = JSON.parse(String(form.get("predictions") || "[]"));
  } catch {
    return json({ error: "Invalid predictions payload" }, 400);
  }
  if (!Array.isArray(list) || !list.length) {
    return json({ error: "No prediction to save" }, 400);
  }

  const clean = list.slice(0, 5).map((p) => ({
    name: String(p?.name || "Unknown Disease").slice(0, 200),
    scientific: String(p?.scientific || "").slice(0, 200),
    level: LEVELS.includes(p?.level) ? p.level : "unknown",
    emoji: String(p?.emoji || "").slice(0, 8),
    confidence: Math.min(1, Math.max(0, Number(p?.confidence) || 0)),
    treatment: Array.isArray(p?.treatment)
      ? p.treatment.slice(0, 20).map((t: unknown) => String(t).slice(0, 500))
      : [],
  }));
  const top = clean[0];

  let imageKey: string | null = null;
  const image = form.get("image");
  if (image && typeof image !== "string") {
    if (!ALLOWED_IMAGE_TYPES.includes(image.type)) {
      return json({ error: "Only JPG, PNG and WEBP images are allowed" }, 400);
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return json({ error: "File too large. Maximum size is 10 MB." }, 400);
    }
    const ext = image.type === "image/jpeg" ? ".jpg" : image.type === "image/webp" ? ".webp" : ".png";
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    imageKey = `${stamp}_${randomBytes(4).toString("hex")}${ext}`;
    await photos().set(imageKey, await image.arrayBuffer(), {
      metadata: { contentType: image.type, userId: user.id },
    });
  }

  const [record] = await db
    .insert(predictions)
    .values({
      userId: user.id,
      crop: top.name.split(" — ")[0] || "Unknown Crop",
      disease: top.name,
      scientific: top.scientific,
      level: top.level,
      confidence: top.confidence,
      predictions: clean,
      treatment: top.treatment,
      imageKey,
    })
    .returning();

  return json({ success: true, record: toPublicPrediction(record, user) }, 201);
}

async function servePhoto(key: string, user: User) {
  const [record] = await db
    .select({ userId: predictions.userId })
    .from(predictions)
    .where(eq(predictions.imageKey, key));
  if (!record || (user.role !== "admin" && record.userId !== user.id)) {
    return new Response("Not found", { status: 404 });
  }
  const blob = await photos().getWithMetadata(key, { type: "arrayBuffer" });
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(blob.data, {
    headers: {
      "Content-Type": String(blob.metadata.contentType || "image/png"),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

async function adminRoutes(req: Request, user: User, parts: string[]) {
  const method = req.method;
  const [resource, id] = parts;

  if (resource === "stats" && method === "GET") {
    const [[u], [f], [p], [h], [a], byCrop] = await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(users).where(eq(users.role, "farmer")),
      db.select({ n: count() }).from(predictions),
      db.select({ n: count() }).from(predictions).where(eq(predictions.level, "healthy")),
      db.select({ v: avg(predictions.confidence) }).from(predictions),
      db
        .select({ crop: predictions.crop, count: count() })
        .from(predictions)
        .groupBy(predictions.crop)
        .orderBy(desc(count())),
    ]);
    const avgConfidence = a.v === null ? null : Math.round(Number(a.v) * 1000) / 1000;
    return json({
      users: u.n,
      farmers: f.n,
      predictions: p.n,
      healthy: h.n,
      diseased: p.n - h.n,
      avg_confidence: avgConfidence,
      by_crop: byCrop.map((row) => ({ crop: row.crop || "—", count: row.count })),
    });
  }

  if (resource === "users" && !id && method === "GET") {
    const rows = await db
      .select({
        user: users,
        predictions: sql<number>`(select count(*)::int from ${predictions} where ${predictions.userId} = ${users.id})`,
      })
      .from(users)
      .orderBy(users.createdAt);
    return json({
      users: rows.map(({ user: row, predictions: n }) => ({
        id: String(row.id),
        name: row.name,
        email: row.email,
        role: row.role,
        isActive: row.isActive,
        created_at: row.createdAt,
        predictions: n || 0,
      })),
    });
  }

  if (resource === "users" && !id && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { name, email, password } = body || {};
    const role = body && body.role === "admin" ? "admin" : "farmer";

    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
      return json({ error: "Name, email and password required" }, 400);
    }
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanName.length < 2) return json({ error: "Name is too short" }, 400);
    if (!EMAIL_RE.test(cleanEmail)) return json({ error: "Please enter a valid email address" }, 400);
    if (!validPassword(password)) return json({ error: "Password must be at least 8 characters" }, 400);

    const [created] = await db
      .insert(users)
      .values({
        name: cleanName,
        email: cleanEmail,
        passwordHash: await bcrypt.hash(password, 10),
        role,
        isActive: true,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) return json({ error: "Email already exists" }, 409);
    return json({ status: "ok", id: String(created.id) }, 201);
  }

  if (resource === "users" && id && method === "DELETE") {
    const targetId = Number(id);
    if (targetId === user.id) {
      return json({ error: "You cannot delete your own account" }, 400);
    }
    const records = await db
      .select({ imageKey: predictions.imageKey })
      .from(predictions)
      .where(eq(predictions.userId, targetId));
    const [deleted] = await db.delete(users).where(eq(users.id, targetId)).returning();
    if (!deleted) return json({ error: "User not found" }, 404);
    await Promise.all(
      records.filter((r) => r.imageKey).map((r) => photos().delete(r.imageKey!))
    );
    return json({ status: "ok" });
  }

  if (resource === "predictions" && !id && method === "GET") {
    return json({ predictions: await listPredictions() });
  }

  if (resource === "predictions" && id && method === "PATCH") {
    const recordId = Number(id);
    const body = (await req.json().catch(() => ({}))) || {};
    const changes: Partial<typeof predictions.$inferInsert> = {};

    if ("reviewed" in body) changes.reviewed = !!body.reviewed;
    if ("notes" in body) changes.notes = String(body.notes || "").slice(0, 2000);
    if ("disease" in body && String(body.disease).trim()) {
      changes.disease = String(body.disease).trim().slice(0, 200);
    }
    if ("confidence" in body) {
      const value = Number(body.confidence);
      if (Number.isNaN(value) || value < 0 || value > 1) {
        return json({ error: "confidence must be between 0 and 1" }, 400);
      }
      changes.confidence = Math.round(value * 10000) / 10000;
    }

    const [updated] = Object.keys(changes).length
      ? await db.update(predictions).set(changes).where(eq(predictions.id, recordId)).returning()
      : await db.select().from(predictions).where(eq(predictions.id, recordId));
    if (!updated) return json({ error: "Record not found" }, 404);

    const [owner] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, updated.userId));
    return json({ status: "ok", prediction: toPublicPrediction(updated, owner) });
  }

  if (resource === "predictions" && id && method === "DELETE") {
    const [deleted] = await db
      .delete(predictions)
      .where(eq(predictions.id, Number(id)))
      .returning();
    if (!deleted) return json({ error: "Record not found" }, 404);
    if (deleted.imageKey) await photos().delete(deleted.imageKey);
    return json({ status: "ok" });
  }

  return json({ error: "Not found" }, 404);
}

/* ---------------- Entry point ---------------- */

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api","auth","login"]
  const method = req.method;

  try {
    if (parts[0] === "uploads" && parts[1]) {
      const user = await authenticate(req, url);
      if (!user) return new Response("Authentication required", { status: 401 });
      return await servePhoto(decodeURIComponent(parts[1]), user);
    }

    const route = parts.slice(1);
    const path = route.join("/");

    if (path === "health") {
      await db.execute(sql`select 1`);
      return json({ status: "ok", database: "connected" });
    }

    if (path === "samples" && method === "GET") {
      const items = (sampleManifest as any[]).map((item) => ({
        ...item,
        url: "/samples/" + (item.file || ""),
      }));
      return json({ samples: items });
    }

    await ensureDemoAccounts();

    if (path === "auth/login" && method === "POST") return await login(req);
    if (path === "auth/register" && method === "POST") return await register(req);

    const user = await authenticate(req, url);
    if (!user) {
      return json({ success: false, message: "Authentication required" }, 401);
    }

    if (path === "auth/me" && method === "GET") {
      return json({ success: true, user: publicUser(user) });
    }

    if (path === "history" && method === "GET") {
      const all = user.role === "admin" && url.searchParams.get("all") === "1";
      return json({ history: await listPredictions(all ? undefined : user.id) });
    }

    if (path === "scans" && method === "POST") return await saveScan(req, user);

    if (route[0] === "admin") {
      if (user.role !== "admin") {
        return json({ success: false, message: "Admin access only" }, 403);
      }
      return await adminRoutes(req, user, route.slice(1));
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("API error:", error);
    return json({ success: false, message: "Server error. Please try again." }, 500);
  }
};

export const config: Config = {
  path: ["/api/*", "/uploads/*"],
};
