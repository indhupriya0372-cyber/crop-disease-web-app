const express = require("express");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Prediction = require("../models/Prediction");
const { authenticate } = require("./auth");
const {
  toPublicPrediction,
  deleteUpload
} = require("../utils/records");

const router = express.Router();

/** Every route below requires a valid token AND the admin role. */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access only"
    });
  }
  next();
}

router.use(authenticate, adminOnly);

/** Headline counts for the dashboard cards. */
router.get("/stats", async (req, res) => {
  try {
    const [users, farmers, predictions, healthy, confidenceAgg, byCrop] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: "farmer" }),
        Prediction.countDocuments({}),
        Prediction.countDocuments({ level: "healthy" }),
        Prediction.aggregate([
          { $group: { _id: null, avg: { $avg: "$confidence" } } }
        ]),
        Prediction.aggregate([
          { $group: { _id: "$crop", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      ]);

    const avgConfidence =
      confidenceAgg.length > 0 ? confidenceAgg[0].avg : null;

    return res.json({
      users,
      farmers,
      predictions,
      healthy,
      diseased: predictions - healthy,
      avg_confidence:
        avgConfidence === null ? null : Math.round(avgConfidence * 1000) / 1000,
      by_crop: byCrop.map((row) => ({
        crop: row._id || "—",
        count: row.count
      }))
    });
  } catch (error) {
    console.error("admin stats error:", error);
    return res.status(500).json({ error: "Could not load stats" });
  }
});

/** List users, or create one (admin may create other admins). */
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: 1 });

    const counts = await Prediction.aggregate([
      { $group: { _id: "$user", count: { $sum: 1 } } }
    ]);
    const countByUser = new Map(
      counts.map((row) => [row._id ? row._id.toString() : null, row.count])
    );

    return res.json({
      users: users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        created_at: user.createdAt,
        predictions: countByUser.get(user._id.toString()) || 0
      }))
    });
  } catch (error) {
    console.error("admin users error:", error);
    return res.status(500).json({ error: "Could not load users" });
  }
});

router.post("/users", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const role = req.body && req.body.role === "admin" ? "admin" : "farmer";

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({ error: "Name, email and password required" });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      return res.status(400).json({ error: "Name is too short" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      role,
      isActive: true
    });

    return res.status(201).json({
      status: "ok",
      id: user._id.toString()
    });
  } catch (error) {
    console.error("admin create user error:", error);

    if (error.code === 11000) {
      return res.status(409).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Could not create user" });
  }
});

/** Deleting a user also removes their predictions and stored photos. */
router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user._id.toString()) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const records = await Prediction.find({ user: id }).select("imagePath");
    records.forEach((record) => deleteUpload(record.imagePath));

    await Prediction.deleteMany({ user: id });
    await User.deleteOne({ _id: id });

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("admin delete user error:", error);
    return res.status(500).json({ error: "Could not delete user" });
  }
});

/** Every prediction, newest first, with the owner's name/email attached. */
router.get("/predictions", async (req, res) => {
  try {
    const records = await Prediction.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("user", "name email");

    return res.json({
      predictions: records.map((record) =>
        toPublicPrediction(record, record.user)
      )
    });
  } catch (error) {
    console.error("admin predictions error:", error);
    return res.status(500).json({ error: "Could not load predictions" });
  }
});

/** Admin edit of a record: review flag, notes, verified disease, confidence. */
router.patch("/predictions/:id", async (req, res) => {
  try {
    const record = await Prediction.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }

    const body = req.body || {};

    if ("reviewed" in body) {
      record.reviewed = !!body.reviewed;
    }

    if ("notes" in body) {
      record.notes = String(body.notes || "").slice(0, 2000);
    }

    if ("disease" in body && String(body.disease).trim()) {
      record.disease = String(body.disease).trim().slice(0, 200);
    }

    if ("confidence" in body) {
      const value = Number(body.confidence);
      if (Number.isNaN(value) || value < 0 || value > 1) {
        return res
          .status(400)
          .json({ error: "confidence must be between 0 and 1" });
      }
      record.confidence = Math.round(value * 10000) / 10000;
    }

    await record.save();
    await record.populate("user", "name email");

    return res.json({
      status: "ok",
      prediction: toPublicPrediction(record, record.user)
    });
  } catch (error) {
    console.error("admin update prediction error:", error);
    return res.status(500).json({ error: "Could not update record" });
  }
});

router.delete("/predictions/:id", async (req, res) => {
  try {
    const record = await Prediction.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }

    deleteUpload(record.imagePath);
    await Prediction.deleteOne({ _id: record._id });

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("admin delete prediction error:", error);
    return res.status(500).json({ error: "Could not delete record" });
  }
});

module.exports = router;
