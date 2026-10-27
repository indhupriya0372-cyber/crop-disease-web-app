"""Server-side predictor for the AgriCare AI web app.

Used by app.py. Analyse an uploaded leaf image and return the top-3
predicted classes with confidence scores and treatment advice.

Mode 1 (real CNN):  if model/crop_cnn.h5 exists, load the trained Keras
                    model and class names, run real inference.
Mode 2 (demo):      otherwise fall back to a lightweight colour/texture
                    heuristic so the app still works end-to-end.

The training script train_cnn.py produces the model. Keep this demo logic
in sync with js/predictor.js.
"""

import io
import os

import numpy as np
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")
CLASSES_PATH = os.path.join(MODEL_DIR, "class_names.txt")
# Keras 3 writes .keras, older Keras used .h5 — accept either.
MODEL_PATHS = [
    os.path.join(MODEL_DIR, "crop_cnn.keras"),
    os.path.join(MODEL_DIR, "crop_cnn.h5"),
]

SIZE = 128
MODEL_SIZE = 224


# --------------------------------------------------------------------------
# Knowledge base: disease name, pathogen, severity, emoji and treatment
# --------------------------------------------------------------------------
KNOWLEDGE = {
    "tomato_leaf_mold": {
        "name": "Tomato — Leaf Mold",
        "scientific": "Fulvia fulva (Passalora fulva)",
        "level": "severe",
        "emoji": "⚠️",
        "treatment": [
            "Improve airflow & reduce humidity below 85%",
            "Remove and dispose of infected lower leaves",
            "Apply copper-based organic fungicide every 7–10 days",
            "Rotate crops and avoid overhead irrigation",
        ],
    },
    "tomato_bacterial_spot": {
        "name": "Tomato — Bacterial Spot",
        "scientific": "Xanthomonas vesicatoria",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Use certified disease-free seeds",
            "Apply copper sprays at first symptom (weekly)",
            "Practice crop rotation (2–3 years)",
            "Avoid working with wet plants",
        ],
    },
    "tomato_healthy": {
        "name": "Tomato — Healthy Leaf",
        "scientific": "Solanum lycopersicum",
        "level": "healthy",
        "emoji": "✅",
        "treatment": [
            "Maintain regular watering and balanced NPK fertilizer",
            "Continue integrated pest management scouting weekly",
            "Keep foliage dry using drip irrigation",
        ],
    },
    "potato_late_blight": {
        "name": "Potato — Late Blight",
        "scientific": "Phytophthora infestans",
        "level": "severe",
        "emoji": "🚨",
        "treatment": [
            "Destroy infected plants immediately, do not compost",
            "Apply protective fungicide (mancozeb/chlorothalonil)",
            "Avoid overhead irrigation; ensure good drainage",
            "Use resistant potato varieties next season",
        ],
    },
    "potato_early_blight": {
        "name": "Potato — Early Blight",
        "scientific": "Alternaria solani",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Fertilize adequately to keep plants vigorous",
            "Remove lower infected leaves",
            "Rotate with non-nightshade crops (2 years)",
            "Apply chlorothalonil or azoxystrobin when needed",
        ],
    },
    "potato_healthy": {
        "name": "Potato — Healthy Leaf",
        "scientific": "Solanum tuberosum",
        "level": "healthy",
        "emoji": "✅",
        "treatment": [
            "Maintain hilling and weed control",
            "Scout for late blight during wet spells",
            "Balanced irrigation and fertilization",
        ],
    },
    "corn_common_rust": {
        "name": "Corn — Common Rust",
        "scientific": "Puccinia sorghi",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Use resistant hybrids",
            "Apply protective fungicide during tasseling if severe",
            "Harvest and destroy crop debris after season",
        ],
    },
    "corn_gray_leaf_spot": {
        "name": "Corn — Gray Leaf Spot",
        "scientific": "Cercospora zeae-maydis",
        "level": "severe",
        "emoji": "⚠️",
        "treatment": [
            "Rotate corn with soybean (2-year rotation)",
            "Tillage to bury infected residue",
            "Apply strobilurin/triazole fungicide at threshold",
        ],
    },
    "corn_healthy": {
        "name": "Corn — Healthy Leaf",
        "scientific": "Zea mays",
        "level": "healthy",
        "emoji": "✅",
        "treatment": [
            "Keep nitrogen schedule on time",
            "Monitor for fall armyworm infestation",
            "Maintain field sanitation",
        ],
    },
    "rice_blast": {
        "name": "Rice — Blast",
        "scientific": "Magnaporthe oryzae (Pyricularia grisea)",
        "level": "severe",
        "emoji": "🚨",
        "treatment": [
            "Split nitrogen applications (avoid excess)",
            "Use resistant varieties",
            "Apply tricyclazole or azoxystrobin at early lesion stage",
            "Maintain proper field drainage",
        ],
    },
    "brinjal_fruit_rot": {
        "name": "Brinjal — Fruit Rot (Phomopsis)",
        "scientific": "Phomopsis vexans",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Remove infected fruits and debris",
            "Copper oxychloride spray at 10-day intervals",
            "Crop rotation, avoid waterlogging",
        ],
    },
    "pepper_bacterial_spot": {
        "name": "Bell Pepper — Bacterial Spot",
        "scientific": "Xanthomonas campestris",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Use disease-free seeds and resistant varieties",
            "Spray copper-based bactericide weekly at first sign",
            "Practice crop rotation (2 years)",
            "Avoid overhead irrigation",
        ],
    },
    "grape_black_rot": {
        "name": "Grape — Black Rot",
        "scientific": "Guignardia bidwellii",
        "level": "severe",
        "emoji": "🚨",
        "treatment": [
            "Remove mummified berries and infected canes",
            "Apply protective fungicide (mancozeb) at bloom",
            "Space vines for good airflow",
            "Sanitise pruning tools between vines",
        ],
    },
    "apple_scab": {
        "name": "Apple — Scab",
        "scientific": "Venturia inaequalis",
        "level": "severe",
        "emoji": "⚠️",
        "treatment": [
            "Rake and destroy fallen leaves (reduces spores)",
            "Apply fungicide at bud break and after wet weather",
            "Prune for airflow inside the canopy",
            "Choose scab-resistant apple varieties",
        ],
    },
    "citrus_greening": {
        "name": "Citrus — Greening (HLB)",
        "scientific": "Candidatus Liberibacter asiaticus",
        "level": "severe",
        "emoji": "🚨",
        "treatment": [
            "Remove and destroy infected trees (no cure)",
            "Control psyllid vectors with neem oil sprays",
            "Use certified disease-free nursery plants",
            "Rogue out alternate host plants (orange jasmine)",
        ],
    },
    "healthy_leaf": {
        "name": "Healthy Leaf (General)",
        "scientific": "Normal plant foliage",
        "level": "healthy",
        "emoji": "✅",
        "treatment": [
            "Weekly visual scouting",
            "Balanced irrigation and nutrition",
            "Maintain integrated pest management practices",
        ],
    },
}

# --------------------------------------------------------------------------
# Extra PlantVillage classes (so any trained model output has advice text)
# --------------------------------------------------------------------------
EXTRA_KNOWLEDGE = {
    "tomato_early_blight": {
        "name": "Tomato — Early Blight",
        "scientific": "Alternaria solani",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Remove lower infected leaves promptly",
            "Mulch to stop soil spores splashing onto leaves",
            "Apply copper or chlorothalonil every 7–10 days",
            "Rotate away from tomatoes/potatoes for 2 years",
        ],
    },
    "tomato_septoria_leaf_spot": {
        "name": "Tomato — Septoria Leaf Spot",
        "scientific": "Septoria lycopersici",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Remove infected leaves and plant debris",
            "Avoid overhead watering; water at the base",
            "Apply protective fungicide weekly in wet weather",
            "Stake plants to improve airflow",
        ],
    },
    "tomato_yellow_leaf_curl_virus": {
        "name": "Tomato — Yellow Leaf Curl Virus",
        "scientific": "Begomovirus (whitefly-transmitted)",
        "level": "severe",
        "emoji": "🚨",
        "treatment": [
            "Control whitefly vectors with yellow sticky traps & neem oil",
            "Remove and destroy infected plants — there is no cure",
            "Use TYLCV-resistant varieties next season",
            "Use reflective mulches and insect nets",
        ],
    },
    "tomato_mosaic_virus": {
        "name": "Tomato — Mosaic Virus",
        "scientific": "Tobacco mosaic virus (ToMV)",
        "level": "severe",
        "emoji": "🚨",
        "treatment": [
            "Remove and burn infected plants",
            "Disinfect tools and hands (milk/bleach solution)",
            "Do not smoke near plants — tobacco spreads the virus",
            "Plant resistant varieties and control aphids",
        ],
    },
    "potato_early_blight": {
        "name": "Potato — Early Blight",
        "scientific": "Alternaria solani",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Fertilize adequately to keep plants vigorous",
            "Remove lower infected leaves",
            "Rotate with non-nightshade crops (2 years)",
            "Apply chlorothalonil or azoxystrobin when needed",
        ],
    },
    "corn_northern_leaf_blight": {
        "name": "Corn — Northern Leaf Blight",
        "scientific": "Exserohilum turcicum",
        "level": "severe",
        "emoji": "⚠️",
        "treatment": [
            "Plant resistant hybrids",
            "Rotate with a non-cereal crop for one season",
            "Apply foliar fungicide at early lesion stage",
            "Bury or remove crop residue after harvest",
        ],
    },
    "rice_healthy": {
        "name": "Rice — Healthy Leaf",
        "scientific": "Oryza sativa",
        "level": "healthy",
        "emoji": "✅",
        "treatment": [
            "Maintain 2–5 cm water depth and even nitrogen",
            "Scout weekly for blast and brown spot",
            "Keep bunds clean to reduce alternate hosts",
        ],
    },
    "rice_brown_spot": {
        "name": "Rice — Brown Spot",
        "scientific": "Bipolaris oryzae (Cochliobolus miyabeanus)",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Correct soil nutrient deficiency (especially potassium)",
            "Use certified, treated seed",
            "Apply fungicide (mancozeb/carbendazim) if severe",
            "Drain the field briefly to reduce humidity",
        ],
    },
    "grape_esca": {
        "name": "Grape — Esca (Black Measles)",
        "scientific": "Phaeomoniella chlamydospora complex",
        "level": "severe",
        "emoji": "🚨",
        "treatment": [
            "Prune out and destroy affected wood",
            "Seal large pruning wounds",
            "Avoid vine stress (water and nutrition balance)",
            "Remove severely infected vines",
        ],
    },
    "grape_leaf_blight": {
        "name": "Grape — Leaf Blight",
        "scientific": "Pseudocercospora vitis",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Remove fallen and infected leaves",
            "Apply copper fungicide after harvest and at bud break",
            "Improve canopy airflow with pruning",
            "Avoid overhead irrigation",
        ],
    },
    "apple_cedar_apple_rust": {
        "name": "Apple — Cedar Apple Rust",
        "scientific": "Gymnosporangium juniperi-virginianae",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Remove nearby juniper/cedar hosts if possible",
            "Apply fungicide from pink bud through early summer",
            "Plant rust-resistant apple varieties",
            "Collect and destroy fallen leaves",
        ],
    },
    "apple_black_rot": {
        "name": "Apple — Black Rot",
        "scientific": "Botryosphaeria obtusa",
        "level": "severe",
        "emoji": "⚠️",
        "treatment": [
            "Prune out cankers and dead wood",
            "Remove mummified fruit from the tree and ground",
            "Apply fungicide during the growing season",
            "Maintain tree vigour with balanced nutrition",
        ],
    },
    "pepper_healthy": {
        "name": "Bell Pepper — Healthy Leaf",
        "scientific": "Capsicum annuum",
        "level": "healthy",
        "emoji": "✅",
        "treatment": [
            "Keep soil evenly moist; avoid waterlogging",
            "Scout for aphids and thrips weekly",
            "Feed with balanced NPK every 3–4 weeks",
        ],
    },
    "citrus_bacterial_spot": {
        "name": "Citrus — Bacterial Spot",
        "scientific": "Xanthomonas citri",
        "level": "warning",
        "emoji": "⚠️",
        "treatment": [
            "Use certified disease-free nursery stock",
            "Apply copper sprays during flushes",
            "Control leafminer insects that open entry wounds",
            "Prune and remove heavily infected shoots",
        ],
    },
    "brinjal_healthy": {
        "name": "Brinjal — Healthy Leaf",
        "scientific": "Solanum melongena",
        "level": "healthy",
        "emoji": "✅",
        "treatment": [
            "Scout weekly for shoot borer and fruit rot",
            "Mulch and water consistently",
            "Rotate with non-solanaceous crops",
        ],
    },
}

KNOWLEDGE.update(EXTRA_KNOWLEDGE)


# --------------------------------------------------------------------------
# Demo heuristic analysis (PIL + numpy colour statistics)
# --------------------------------------------------------------------------
def _analyze(img):
    img = img.convert("RGB").resize((SIZE, SIZE))
    arr = np.asarray(img).astype(int)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    greens = ((g > 60) & (g > r * 1.08) & (g > b * 1.08)).sum()
    reds = ((r > 100) & (r > g * 1.35) & (r > b * 1.30)).sum()
    yellows = ((r > 120) & (g > 90) & (b < 90) & (r > b * 1.80)).sum()
    browns = ((r > 70) & (r > g * 1.15) & (g > b * 1.05) & (r < 200)).sum()
    darks = ((r < 95) & (g < 90) & (b < 85)).sum()  # necrosis / mould
    grays = ((abs(r - g) < 22) & (abs(g - b) < 22) & (r > 95) & (r < 190)).sum()

    total = SIZE * SIZE
    lesions = reds + yellows + browns + darks + grays
    return {
        "pGreen": greens / total,
        "pRed": reds / total,
        "pYellow": yellows / total,
        "pBrown": browns / total,
        "pDark": darks / total,
        "pGray": grays / total,
        "pStress": (reds + yellows + browns) / total,
        "pLesion": lesions / total,
    }


def _predict_demo(stats):
    p_stress = stats["pStress"]
    p_lesion = stats["pLesion"]
    p_red = stats["pRed"]
    p_brown = stats["pBrown"]
    p_yellow = stats["pYellow"]
    p_dark = stats["pDark"]
    p_gray = stats["pGray"]

    # No meaningful lesion surface -> healthy leaf
    if p_lesion < 0.02:
        scores = {"healthy_leaf": 0.91, "corn_gray_leaf_spot": 0.045, "tomato_leaf_mold": 0.045}
    elif p_dark > 0.03:
        scores = {"potato_late_blight": 0.74, "apple_black_rot": 0.14, "tomato_early_blight": 0.12}
    elif p_red > 0.05:
        scores = {"tomato_bacterial_spot": 0.71, "corn_common_rust": 0.16, "pepper_bacterial_spot": 0.13}
    elif p_brown > 0.05:
        scores = {"tomato_early_blight": 0.66, "potato_early_blight": 0.19, "brinjal_fruit_rot": 0.15}
    elif p_gray > 0.03:
        scores = {"corn_gray_leaf_spot": 0.63, "corn_northern_leaf_blight": 0.22, "rice_blast": 0.15}
    elif p_yellow > 0.05:
        scores = {"tomato_leaf_mold": 0.64, "tomato_yellow_leaf_curl_virus": 0.20, "rice_brown_spot": 0.16}
    elif p_stress > 0.03:
        scores = {"tomato_septoria_leaf_spot": 0.55, "corn_common_rust": 0.25, "rice_blast": 0.20}
    else:
        scores = {"potato_early_blight": 0.58, "corn_common_rust": 0.22, "brinjal_fruit_rot": 0.20}

    return _build_results(scores)


# --------------------------------------------------------------------------
# Real CNN inference (optional — requires trained model from train_cnn.py)
# --------------------------------------------------------------------------
_model = None
_class_names = None


def _model_path():
    for path in MODEL_PATHS:
        if os.path.exists(path):
            return path
    return None


def _load_model():
    global _model, _class_names
    if _model is not None:
        return _model
    path = _model_path()
    if path is None:
        return None
    try:
        from keras.models import load_model

        _model = load_model(path)
        _class_names = _load_class_names()
    except Exception as exc:  # pragma: no cover
        print("Could not load Keras model, falling back to demo: %s" % exc)
        _model = None
    return _model


def _load_class_names():
    if os.path.exists(CLASSES_PATH):
        with open(CLASSES_PATH, encoding="utf-8") as fh:
            return [line.strip() for line in fh if line.strip()]
    return None


def _predict_cnn(img):
    model = _load_model()
    if model is None or not _class_names:
        return None

    img = img.convert("RGB").resize((MODEL_SIZE, MODEL_SIZE))
    x = np.asarray(img, dtype="float32") / 255.0
    x = np.expand_dims(x, axis=0)

    try:
        probs = model.predict(x, verbose=0)[0]
    except Exception as exc:  # pragma: no cover
        print("CNN inference failed, falling back to demo: %s" % exc)
        return None

    top = np.argsort(probs)[::-1][:3]
    return _build_results({_class_names[i]: float(probs[i]) for i in top})


# --------------------------------------------------------------------------
# Shared helpers
# --------------------------------------------------------------------------
def _build_results(scores):
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:3]
    results = []
    for key, confidence in ranked:
        info = KNOWLEDGE.get(key, {
            "name": key.replace("_", " ").title(),
            "scientific": "Unknown",
            "level": "warning",
            "emoji": "⚠️",
            "treatment": ["Consult a local agriculture officer for treatment advice."],
        })
        results.append({
            "key": key,
            "name": info["name"],
            "scientific": info["scientific"],
            "level": info["level"],
            "emoji": info["emoji"],
            "confidence": round(confidence, 3),
            "treatment": info["treatment"],
        })
    return results


def predict_image_bytes(data: bytes):
    """Main entry point: raw image bytes -> list of top-3 prediction dicts."""
    if not data:
        raise ValueError("empty image data")

    img = Image.open(io.BytesIO(data))
    img.load()

    cnn_result = _predict_cnn(img)
    if cnn_result:
        return cnn_result

    return _predict_demo(_analyze(img))