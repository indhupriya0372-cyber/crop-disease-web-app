const express = require("express");
const Prediction = require("../models/Prediction");
const { authenticate } = require("./auth");
const { readSamples, toPublicPrediction } = require("../utils/records");

const router = express.Router();

/**
 * Diagnosis history.
 *   farmers -> only their own records
 *   admins  -> everything when ?all=1 is passed
 */
router.get("/history", authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const wantsAll = req.query.all === "1";

    const filter = isAdmin && wantsAll ? {} : { user: req.user._id };

    const records = await Prediction.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("user", "name email");

    return res.json({
      history: records.map((record) =>
        toPublicPrediction(record, record.user)
      )
    });
  } catch (error) {
    console.error("history error:", error);
    return res.status(500).json({ error: "Could not load history" });
  }
});

/** Labelled demo images used by the diagnose page gallery. */
router.get("/samples", async (req, res) => {
  const items = readSamples().map((item) => ({
    ...item,
    url: item.url || "/samples/" + (item.file || "")
  }));
  res.json({ samples: items });
});

module.exports = router;
