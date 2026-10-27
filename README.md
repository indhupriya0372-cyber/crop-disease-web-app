# 🌾 AgriCare AI — Crop Disease Prediction Web App (CNN Image Classifier)

AI-Driven Crop Disease Prediction Web App — B.Tech major project (Zeroth Review).

This repository contains a **fully working front-end prototype** built with **HTML, CSS and JavaScript**. It demonstrates the project's UI and the disease-detection pipeline. The final system will pair this UI with a **CNN (TensorFlow/Keras)** backend trained on the **PlantVillage** dataset.

## ✨ Features (this prototype)

- Drag-and-drop / browse leaf-photo upload (JPG, PNG, WEBP)
- Browser-side demo classifier (pixel/colour analysis) that simulates the CNN inference
- Top-3 predictions with **confidence bars**
- Disease description + **organic treatment recommendations**
- **Login system with two separate roles** — farmers and administrators, each locked to its own page
- **Farmer:** upload a leaf, get top-3 scores + treatment, and see only their own **My Recent Scans**
- **Admin:** see every farmer's leaf photo and result, then review, annotate, correct or delete records, plus user management
- **238 labelled test samples** across 29 crop/disease classes (click any one to test the model)
- Responsive, mobile-friendly design
- Full project info sections: problem, existing vs proposed system, objectives, scope, tech stack, literature survey, dataset, timeline, team (perfect for your review)

## 🔐 Login accounts — two separate roles

The app creates a local SQLite database (`agricare.db`) on first run with two demo accounts:

| Role   | Email                | Password    | Lands on  | Sees                                                        |
| ------ | -------------------- | ----------- | --------- | ----------------------------------------------------------- |
| Farmer | `farmer@agricare.ai` | `farmer123` | Diagnose  | Upload a leaf → top-3 scores + treatment, and **My Recent Scans** |
| Admin  | `admin@agricare.ai`  | `admin123`  | Admin     | **Every** farmer's photo and result, notes, review, users, stats |

Each role is locked to its own page — the server redirects you if you try the other one:

- A **farmer** opening `/admin.html` is sent back to `/diagnose.html`.
- An **admin** opening `/diagnose.html` is sent to `/admin.html`.
- Only admins can review, annotate, correct or delete a record.

New farmers can self-register from the **Register** tab. Admin accounts are created from the
admin panel, so nobody can promote themselves through public registration.

Run `python app.py` and open <http://127.0.0.1:5000>. The navbar shows a **Login** button
until you sign in, then your name, role and a **Logout** button.

### What the farmer does

Upload a leaf (or click one of the 238 labelled samples) → get the top-3 diseases with
confidence bars and treatment steps. Every scan is saved with its photo and shows up in
**My Recent Scans** on the same page. Farmers never see other farmers' data.

### What the admin does

The admin panel has three tabs:

- **All Predictions** — the uploaded photo of every scan, who sent it, crop, diagnosis,
  severity and confidence. Use ✅ to mark a record reviewed, ✎ to attach an agronomist
  note, 🗑 to delete a record and its photo.
- **Users** — create farmer/admin accounts and delete users (their records go too).
- **Crop Breakdown** — how many scans per crop and average confidence.

## 🗂 Project structure

```
crop-disease-web-app/
├── index.html                  # Home — hero, features, disease gallery, crops, testimonials
├── login.html                  # Login + register (farmer / admin tabs)
├── admin.html                  # Admin — every leaf photo + result, notes, review, users, stats
├── diagnose.html               # Farmer — upload a leaf, get scores, My Recent Scans
├── about.html                  # Project info — abstract, problem, objectives, scope, literature, timeline, team
├── contact.html                # Contact form + FAQ
├── css/
│   └── style.css               # One global stylesheet (green agriculture theme)
├── js/
│   ├── site.js                 # Shared: navbar, FAQ, counters, crop selector, contact form
│   ├── auth.js                 # Navbar login/logout, login form, AgriCareAuth helper
│   ├── admin.js                # Admin stats, users, photo review, record notes/delete
│   ├── predictor.js            # In-browser demo classifier (fallback)
│   └── diagnose.js             # Tool logic: upload + call /api/predict + samples + My Recent Scans
├── assets/images/              # Generated leaf images for the gallery & hero
├── samples/                    # 238 labelled test images + manifest.json
├── app.py                      # Flask backend (auth, pages, /api/*, SQLite storage)
├── predictor.py                # Server-side analysis (real CNN or demo fallback)
├── generate_assets.py          # Regenerate the gallery images: py generate_assets.py
├── generate_samples.py         # Create the labelled test sample set
├── evaluate_model.py           # Score the model on every sample
├── smoke_test.py               # End-to-end backend test (39 checks)
├── train_cnn.py                # Train the real CNN model
├── agricare.db                 # SQLite DB (users + history) — auto-created
├── requirements.txt            # Python dependencies
└── docs/
    ├── zeroth-review-ppt-content.md   # Canva-ready PPT content
    └── gamma-ai-prompt.txt            # 500-word Gamma AI prompt (points)
```

## ▶️ Run it in VS Code

**Option A — with the Flask backend (recommended):**

1. Open this folder in VS Code (`File → Open Folder`)
2. Open a terminal (`Ctrl + `` `)
3. Create & activate a virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate        # on Windows
   # source .venv/bin/activate   # on macOS/Linux
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Start the server:
   ```bash
   python app.py
   ```
## 🚀 Running it

**Easiest:** double-click **`run.bat`**. It finds a free port automatically (5000 is often
taken by other projects), starts the server and opens the browser. Keep the black window
open while you use the app.

**Manual:**

```powershell
.\.venv\Scripts\python.exe app.py          # uses port 5000
$env:PORT=5055; .\.venv\Scripts\python.exe app.py   # pick another port
```

Open the address it prints. The Diagnose page shows an orange banner if the backend is not
connected, so you always know whether the server is running.

## 🔐 Logging in

   - Farmer → `farmer@agricare.ai` / `farmer123`  (lands on Diagnose)
   - Admin  → `admin@agricare.ai`  / `admin123`   (lands on Admin Panel)

Go to **Diagnose** (farmers) → upload a leaf photo (or click a sample) → **Analyze Leaf**.
The frontend calls `/api/predict`; for a logged-in farmer the result and its photo are
saved. Admins view and manage everything from the Admin Panel.

## 🧪 Test samples (much more data to test the model)

The `samples/` folder ships with **238 labelled images** covering 29 crop/disease
classes (Tomato, Potato, Corn, Rice, Brinjal, Pepper, Grape, Apple, Citrus — healthy
and infected). On the Diagnose page they appear as a filterable gallery: pick a crop
tab, click any leaf, and it is analysed and saved to your history immediately.

Create more or fewer:

```bash
python generate_samples.py --per-class 8              # 8 images per class
python generate_samples.py --per-class 20 --dataset dataset   # also build train/valid splits
python generate_samples.py --clean --per-class 12     # regenerate from scratch
```

Score the model over the whole set (writes `samples/evaluation_results.csv`):

```bash
python evaluate_model.py
```

Output reports top-1 exact-class accuracy and health-level agreement per class. With the
demo heuristic loaded the exact-class number stays low (it is a colour heuristic, not a
real classifier) — train the CNN below and re-run to see meaningful accuracy.

Verify the backend end to end (39 checks, no server needed):

```bash
python smoke_test.py
```

**Option B — static only (no Python):**

Just right-click `index.html` → **Open with Live Server** (VS Code extension) or double-click it. The home, about and contact pages work as before, and the JS demo classifier runs in the browser. Note that login, the role split, the sample gallery and saved results are **server features** — they need `python app.py` running.

## 🖼 Regenerating the leaf images

The gallery images under `assets/images/` are generated by:

```bash
py generate_assets.py
```

Run it again if you want a different random seed or new crops (edit `generate_assets.py`).

## 🧠 Using the real CNN model (First Review)

1. Install TensorFlow (uncomment in `requirements.txt`) and download the Kaggle *New Plant Diseases Dataset*.
2. Place it as `dataset/train/<class>/...` and `dataset/valid/<class>/...`
   (or skip the download entirely and use `python generate_samples.py --per-class 20 --dataset dataset`
   to get a working 29-class dataset immediately for a pipeline smoke test)
3. Train:
   ```bash
   python train_cnn.py --data dataset --epochs 10
   ```
4. This saves `model/crop_cnn.keras` + `model/class_names.txt` — `predictor.py` auto-loads them and switches from the demo heuristic to **real CNN inference**. Both `.keras` (Keras 3) and the older `.h5` are detected.

To train from scratch without downloading ImageNet weights (useful offline):

```bash
python train_cnn.py --data dataset --epochs 5 --weights none
```

After training, re-score everything:

```bash
python evaluate_model.py
```

## 🔭 Roadmap to the real system (First Review)

1. **First Review** — train a CNN baseline (MobileNetV2/ResNet50 transfer learning) on PlantVillage; evaluate accuracy/confusion matrix with `evaluate_model.py`; finalise backend API (`train_cnn.py` → real CNN in `predictor.py`).
2. **Second Review** — hyper-parameter tuning, augmentation, Grad-CAM explainability, >95% target accuracy.
3. **Final Review** — ✅ login/roles (done: farmer + admin, SQLite), deployment, documentation.

## 📄 Review documents

- `docs/zeroth-review-ppt-content.md` — ready-to-paste slide content for Canva (Title, Abstract, Introduction, Problem, Existing, Proposed, Objectives, Scope, Literature Survey, + extra slides).

## 🤝 Team

Add your names/roll numbers in the "Team" section of `index.html` and the title slide of the PPT.

---

*Built as part of a B.Tech major project. Academic demonstration only — not a substitute for professional agronomy advice.*