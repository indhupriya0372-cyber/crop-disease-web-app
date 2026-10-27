const mongoose = require("mongoose");

const predictionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    crop: { type: String, default: "" },
    disease: { type: String, required: true },
    scientific: { type: String, default: "" },

    level: {
      type: String,
      enum: ["healthy", "warning", "severe", "unknown"],
      default: "unknown"
    },

    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },

    // Full top-3 list so the admin can see what else the model considered.
    predictions: {
      type: [
        {
          name: String,
          scientific: String,
          level: String,
          emoji: String,
          confidence: Number,
          treatment: [String]
        }
      ],
      default: []
    },

    treatment: { type: [String], default: [] },

    imagePath: { type: String, default: null },

    // Admin review fields
    reviewed: { type: Boolean, default: false },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

predictionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Prediction", predictionSchema);
