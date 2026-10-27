const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROJECT_DIR = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(PROJECT_DIR, "Data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const SAMPLES_DIR = path.join(DATA_DIR, "samples");
const MANIFEST = path.join(SAMPLES_DIR, "manifest.json");

const ALLOWED_EXT = [".png", ".jpg", ".jpeg", ".webp"];

/**
 * Convert a Mongoose prediction document into the shape the front end expects.
 * Keeping this in one place means the farmer view and the admin view never drift.
 */
function toPublicPrediction(doc, user) {
  const record = doc.toObject ? doc.toObject() : doc;

  const imageName = record.imagePath
    ? path.basename(record.imagePath)
    : null;

  // record.user may be a plain ObjectId or a fully populated User document,
  // so resolve the id in both cases instead of calling toString() blindly.
  const rawUser = record.user;
  const userId = rawUser
    ? (rawUser._id ? rawUser._id.toString() : rawUser.toString())
    : null;

  return {
    id: record._id.toString(),
    userId,
    user_name: user ? user.name : undefined,
    user_email: user ? user.email : undefined,
    crop: record.crop || "—",
    disease: record.disease,
    scientific: record.scientific || "",
    level: record.level || "unknown",
    confidence: record.confidence,
    treatment: Array.isArray(record.treatment) ? record.treatment : [],
    image_url: imageName ? "/uploads/" + imageName : null,
    reviewed: !!record.reviewed,
    notes: record.notes || "",
    created_at: record.createdAt
  };
}

/**
 * Write an uploaded leaf photo to disk. A timestamp + random suffix keeps
 * concurrent uploads from overwriting each other.
 */
function saveUpload(buffer, originalName) {
  const ext = ALLOWED_EXT.includes(path.extname(originalName || "").toLowerCase())
    ? path.extname(originalName).toLowerCase()
    : ".png";

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const fileName = `${stamp}_${crypto.randomBytes(4).toString("hex")}${ext}`;

  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buffer);
  return fileName;
}

/** Remove a stored photo, ignoring the case where it is already gone. */
function deleteUpload(fileName) {
  if (!fileName) return;
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(fileName)));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not delete upload:", error.message);
    }
  }
}

/** Read the labelled sample manifest, tolerating a missing or broken file. */
function readSamples() {
  try {
    const raw = fs.readFileSync(MANIFEST, "utf8");
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch (error) {
    return [];
  }
}

module.exports = {
  UPLOAD_DIR,
  SAMPLES_DIR,
  toPublicPrediction,
  saveUpload,
  deleteUpload,
  readSamples
};
