require("dotenv").config();

const path = require("path");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");

const Prediction = require("./models/Prediction");
const authRoutes = require("./routes/auth");
const historyRoutes = require("./routes/history");
const adminRoutes = require("./routes/admin");
const {
  UPLOAD_DIR,
  SAMPLES_DIR,
  toPublicPrediction,
  saveUpload
} = require("./utils/records");

const app = express();

app.disable("x-powered-by");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;
const PYTHON_API = "http://127.0.0.1:5000";

const { authenticate } = authRoutes;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error(
        "Only JPG, PNG and WEBP images are allowed"
      ));
    }
  }
});

// Uploaded leaf photos are private. A browser <img> tag cannot send an
// Authorization header, so the JWT is also accepted as a ?token= query
// parameter for this route only.
async function authenticateStaticOrToken(req, res, next) {
  const queryToken = req.query.token;

  if (typeof queryToken === "string" && queryToken) {
    req.headers.authorization = "Bearer " + queryToken;
  }

  return authenticate(req, res, next);
}

// The front end is a static site served by this same server, so its fetch
// calls and the JWT it holds always target one origin.
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");

// Never let the browser cache HTML/JS/CSS. Without this, an old cached
// auth.js or diagnose.js keeps running after an edit, which looks like
// "the project is not working properly".
app.use((req, res, next) => {
  if (/\.(html|js|css)$/i.test(req.path) || req.path === "/") {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

app.use("/uploads", authenticateStaticOrToken, express.static(UPLOAD_DIR));
app.use("/samples", express.static(SAMPLES_DIR));
app.use(express.static(FRONTEND_DIR));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api", historyRoutes);
app.use("/api/admin", adminRoutes);

app.post(
  "/api/predict",
  authenticate,
  (req, res, next) => {
    upload.single("image")(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          error: error.message
        });
      }

      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Please upload a crop image"
        });
      }

      const formData = new FormData();

      formData.append("file", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });

      const response = await axios.post(
        `${PYTHON_API}/api/predict`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000
        }
      );

      const predictions = response.data.predictions;

      if (
        !Array.isArray(predictions) ||
        predictions.length === 0
      ) {
        return res.status(502).json({
          error: "No prediction returned from AI service"
        });
      }

      const top = predictions[0];

      const disease = top.name || "Unknown Disease";
      const crop = disease.split(" — ")[0] || "Unknown Crop";
      const confidence = Number(top.confidence);

      const imagePath = saveUpload(req.file.buffer, req.file.originalname);

      const record = await Prediction.create({
        user: req.user._id,
        crop,
        disease,
        scientific: top.scientific || "",
        level: top.level || "unknown",
        confidence: Number.isFinite(confidence) ? confidence : 0,
        predictions,
        treatment: Array.isArray(top.treatment) ? top.treatment : [],
        imagePath
      });

      return res.json({
        success: true,
        predictions,
        record: toPublicPrediction(record, req.user)
      });
    } catch (error) {
      console.error(
        "Prediction Error:",
        error.message
      );

      if (error.response) {
        return res.status(502).json({
          error:
            error.response.data?.error ||
            "Python prediction service failed"
        });
      }

      return res.status(500).json({
        error: "Unable to predict crop disease"
      });
    }
  }
);

async function startServer() {
  try {
    if (!MONGO_URI) {
      throw new Error(
        "MONGO_URI is missing in .env"
      );
    }

    if (
      !process.env.JWT_SECRET ||
      process.env.JWT_SECRET.length < 32 ||
      process.env.JWT_SECRET ===
        "REPLACE_WITH_YOUR_GENERATED_SECRET"
    ) {
      throw new Error(
        "Configure a secure JWT_SECRET in .env"
      );
    }

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000
    });

    console.log(
      "MongoDB Connected Successfully"
    );

    console.log(
      "Database:",
      mongoose.connection.name
    );

    app.listen(PORT, "127.0.0.1", () => {
      console.log(
        `Node Server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Startup Error:",
      error.message
    );

    process.exit(1);
  }
}

startServer();