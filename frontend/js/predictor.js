/* ============================================================
   AgriCare AI — Demo Classifier
   Lightweight browser-side image analysis used to simulate the
   final CNN pipeline. Real model = CNN (TensorFlow/Keras) on
   the backend, trained on the PlantVillage dataset.
   ============================================================ */

const DEMO_KNOWLEDGE = {
  tomato_leaf_mold: {
    name: 'Tomato — Leaf Mold',
    scientific: 'Fulvia fulva (Passalora fulva)',
    level: 'severe',
    emoji: '⚠️',
    prevalence: 'Very common in warm, humid greenhouses. Symptoms: pale green/yellow blotches on the upper leaf surface, olive-gray mold on the underside.',
    treatment: [
      'Improve airflow & reduce humidity below 85%',
      'Remove and dispose of infected lower leaves',
      'Apply copper-based organic fungicide every 7–10 days',
      'Rotate crops and avoid overhead irrigation'
    ]
  },
  tomato_bacterial_spot: {
    name: 'Tomato — Bacterial Spot',
    scientific: 'Xanthomonas vesicatoria',
    level: 'warning',
    emoji: '⚠️',
    prevalence: 'Water-soaked spots turning into dark, scabby lesions with yellow halos on leaves and fruit.',
    treatment: [
      'Use certified disease-free seeds',
      'Apply copper sprays at first symptom (weekly)',
      'Practice crop rotation (2–3 years)',
      'Avoid working with wet plants'
    ]
  },
  tomato_healthy: {
    name: 'Tomato — Healthy Leaf',
    scientific: 'Solanum lycopersicum',
    level: 'healthy',
    emoji: '✅',
    prevalence: 'Uniform green color with no lesions, mildew or chlorosis observed.',
    treatment: [
      'Maintain regular watering and balanced NPK fertilizer',
      'Continue IPM scouting weekly',
      'Keep foliage dry using drip irrigation'
    ]
  },
  potato_late_blight: {
    name: 'Potato — Late Blight',
    scientific: 'Phytophthora infestans',
    level: 'severe',
    emoji: '🚨',
    prevalence: 'Dangerous. Dark brown/black lesions with white fungal ring on leaf undersides; spreads fast in cool, wet weather (cause of Irish famine).',
    treatment: [
      'Destroy infected plants immediately, do not compost',
      'Apply protective fungicide (mancozeb/chlorothalonil)',
      'Avoid overhead irrigation; ensure good drainage',
      'Use resistant potato varieties next season'
    ]
  },
  potato_early_blight: {
    name: 'Potato — Early Blight',
    scientific: 'Alternaria solani',
    level: 'warning',
    emoji: '⚠️',
    prevalence: 'Target-shaped brown rings ("bullseye") surrounded by yellow halo, mainly on older leaves.',
    treatment: [
      'Fertilize adequately to keep plants vigorous',
      'Remove lower infected leaves',
      'Rotate with non-nightshade crops (2 years)',
      'Apply chlorothalonil or azoxystrobin when needed'
    ]
  },
  potato_healthy: {
    name: 'Potato — Healthy Leaf',
    scientific: 'Solanum tuberosum',
    level: 'healthy',
    emoji: '✅',
    prevalence: 'Uniform green foliage, no necrotic spots or wilting observed.',
    treatment: [
      'Maintain hilling and weed control',
      'Scout for late blight during wet spells',
      'Balanced irrigation and fertilization'
    ]
  },
  corn_common_rust: {
    name: 'Corn — Common Rust',
    scientific: 'Puccinia sorghi',
    level: 'warning',
    emoji: '⚠️',
    prevalence: 'Cinnamon-brown, powdery pustules on both leaf surfaces; heavy infection reduces yield.',
    treatment: [
      'Use resistant hybrids',
      'Apply protective fungicide during tasseling if severe',
      'Harvest and destroy crop debris after season'
    ]
  },
  corn_gray_leaf_spot: {
    name: 'Corn — Gray Leaf Spot',
    scientific: 'Cercospora zeae-maydis',
    level: 'severe',
    emoji: '⚠️',
    prevalence: 'Long, narrow, rectangular gray-brown lesions running parallel to leaf veins, favored by warm humid weather.',
    treatment: [
      'Rotate corn with soybean (2-year rotation)',
      'Tillage to bury infected residue',
      'Apply strobilurin/triazole fungicide at threshold'
    ]
  },
  corn_healthy: {
    name: 'Corn — Healthy Leaf',
    scientific: 'Zea mays',
    level: 'healthy',
    emoji: '✅',
    prevalence: 'Uniform green blades; dense leaf area indicates good plant health.',
    treatment: [
      'Keep nitrogen schedule on time',
      'Monitor for fall armyworm infestation',
      'Maintain field sanitation'
    ]
  },
  rice_blast: {
    name: 'Rice — Blast',
    scientific: 'Magnaporthe oryzae (Pyricularia grisea)',
    level: 'severe',
    emoji: '🚨',
    prevalence: 'Diamond-shaped lesions with gray center and brown border on leaves; severe in high nitrogen, humid paddies.',
    treatment: [
      'Split nitrogen applications (avoid excess)',
      'Use resistant varieties',
      'Apply tricyclazole or azoxystrobin at early lesion stage',
      'Maintain proper field drainage'
    ]
  },
  brinjal_fruit_rot: {
    name: 'Brinjal — Fruit Rot (Phomopsis)',
    scientific: 'Phomopsis vexans',
    level: 'warning',
    emoji: '⚠️',
    prevalence: 'Pale sunken spots on leaves/fruit turning dark with fungal growth; common in warm humid seasons.',
    treatment: [
      'Remove infected fruits and debris',
      'Copper oxychloride spray at 10-day intervals',
      'Crop rotation, avoid waterlogging'
    ]
  },
  rice_brown_spot: {
    name: 'Rice — Brown Spot',
    scientific: 'Bipolaris oryzae',
    level: 'warning',
    emoji: '⚠️',
    prevalence: 'Oval brown spots with grey centres; worsens in nutrient-deficient soil.',
    treatment: [
      'Correct potassium deficiency',
      'Use certified treated seed',
      'Apply mancozeb if severe',
      'Drain the field briefly to cut humidity'
    ]
  },
  healthy_leaf: {
    name: 'Healthy Leaf (General)',
    scientific: 'Normal plant foliage',
    level: 'healthy',
    emoji: '✅',
    prevalence: 'No anomalies detected. Continue standard agronomic practices.',
    treatment: [
      'Weekly visual scouting',
      'Balanced irrigation and nutrition',
      'Maintain IPM practices'
    ]
  },
  apple_black_rot: {
    name: 'Apple — Black Rot',
    scientific: 'Botryosphaeria obtusa',
    level: 'severe',
    emoji: '🚨',
    prevalence: 'Purple specks enlarging into brown circles with concentric rings (frogeye leaf spot).',
    treatment: [
      'Prune out cankers and dead wood',
      'Remove mummified fruit',
      'Apply fungicide in the growing season',
      'Keep trees vigorous with balanced nutrition'
    ]
  },
  corn_northern_leaf_blight: {
    name: 'Corn — Northern Leaf Blight',
    scientific: 'Exserohilum turcicum',
    level: 'severe',
    emoji: '🚨',
    prevalence: 'Long grey-green cigar-shaped lesions that can grey out the whole leaf.',
    treatment: [
      'Plant resistant hybrids',
      'Rotate with a non-cereal crop',
      'Apply foliar fungicide early',
      'Bury crop residue after harvest'
    ]
  },
  tomato_early_blight: {
    name: 'Tomato — Early Blight',
    scientific: 'Alternaria solani',
    level: 'warning',
    emoji: '⚠️',
    prevalence: 'Target-shaped brown rings with a yellow halo on older leaves.',
    treatment: [
      'Remove lower infected leaves',
      'Mulch to stop soil splash',
      'Apply copper every 7–10 days',
      'Rotate away from tomatoes for 2 years'
    ]
  },
  tomato_septoria_leaf_spot: {
    name: 'Tomato — Septoria Leaf Spot',
    scientific: 'Septoria lycopersici',
    level: 'warning',
    emoji: '⚠️',
    prevalence: 'Many small circular spots with pale centres and dark margins.',
    treatment: [
      'Remove infected leaves and debris',
      'Water at the base only',
      'Protective fungicide weekly in wet weather',
      'Stake plants for airflow'
    ]
  },
  tomato_yellow_leaf_curl_virus: {
    name: 'Tomato — Yellow Leaf Curl Virus',
    scientific: 'Begomovirus (whitefly-transmitted)',
    level: 'severe',
    emoji: '🚨',
    prevalence: 'Upward leaf curl with bright yellowing and stunted growth.',
    treatment: [
      'Control whitefly with sticky traps and neem oil',
      'Remove and destroy infected plants',
      'Use resistant varieties next season',
      'Use reflective mulch and insect nets'
    ]
  },
  pepper_bacterial_spot: {
    name: 'Bell Pepper — Bacterial Spot',
    scientific: 'Xanthomonas campestris',
    level: 'warning',
    emoji: '⚠️',
    prevalence: 'Small water-soaked spots turning dark and scabby on leaves and fruit.',
    treatment: [
      'Use disease-free seed and resistant varieties',
      'Copper bactericide weekly at first sign',
      'Rotate for 2 years',
      'Avoid overhead irrigation'
    ]
  }
};

const DEMO_CLASSES = Object.keys(DEMO_KNOWLEDGE);

/**
 * Analyze an ImageBitmap / HTMLImageElement by sampling pixels on a canvas.
 * Heuristic color/spot analysis stands in for CNN feature extraction.
 */
function analyzeImage(img) {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  let greens = 0, reds = 0, yellows = 0, browns = 0, darks = 0, grays = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (g > 60 && g > r * 1.08 && g > b * 1.08) greens++;
    else if (r > 100 && r > g * 1.35 && r > b * 1.3) reds++;
    else if (r > 120 && g > 90 && b < 90 && r > b * 1.8) yellows++;
    else if (r > 70 && r > g * 1.15 && g > b * 1.05 && r < 200) browns++;
    else if (r < 95 && g < 90 && b < 85) darks++;
    else if (Math.abs(r - g) < 22 && Math.abs(g - b) < 22 && r > 95 && r < 190) grays++;
    total++;
  }
  const pGreen = greens / total;
  const pRed = reds / total;
  const pYellow = yellows / total;
  const pBrown = browns / total;
  const pDark = darks / total;
  const pGray = grays / total;
  const pStress = pYellow + pBrown + pRed;
  const pLesion = pRed + pYellow + pBrown + pDark + pGray;

  return { pGreen, pRed, pYellow, pBrown, pDark, pGray, pStress, pLesion, size };
}

/** Produce a plausible demo prediction from color statistics. */
function predictFromStats(stats) {
  const { pStress, pLesion, pRed, pBrown, pYellow, pDark, pGray } = stats;

  let scores = {};
  if (pLesion < 0.02) {
    scores = { healthy_leaf: 0.91, corn_gray_leaf_spot: 0.045, tomato_leaf_mold: 0.045 };
  } else if (pDark > 0.03) {
    scores = { potato_late_blight: 0.74, apple_black_rot: 0.14, tomato_early_blight: 0.12 };
  } else if (pRed > 0.05) {
    scores = { tomato_bacterial_spot: 0.71, corn_common_rust: 0.16, pepper_bacterial_spot: 0.13 };
  } else if (pBrown > 0.05) {
    scores = { tomato_early_blight: 0.66, potato_early_blight: 0.19, brinjal_fruit_rot: 0.15 };
  } else if (pGray > 0.03) {
    scores = { corn_gray_leaf_spot: 0.63, corn_northern_leaf_blight: 0.22, rice_blast: 0.15 };
  } else if (pYellow > 0.05) {
    scores = { tomato_leaf_mold: 0.64, tomato_yellow_leaf_curl_virus: 0.20, rice_brown_spot: 0.16 };
  } else if (pStress > 0.03) {
    scores = { tomato_septoria_leaf_spot: 0.55, corn_common_rust: 0.25, rice_blast: 0.20 };
  } else {
    scores = { potato_early_blight: 0.58, corn_common_rust: 0.22, brinjal_fruit_rot: 0.20 };
  }

  const list = Object.entries(scores)
    .map(([key, confidence]) => ({ key, confidence }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return { primary: list[0].key, predictions: list };
}

/** Full demo prediction pipeline: resize -> stats -> prediction. */
async function demoPredict(img) {
  const stats = analyzeImage(img);
  const { predictions } = predictFromStats(stats);

  // simulate network latency of a real model call
  await new Promise((res) => setTimeout(res, 1200));

  return predictions.map((p) => ({
    ...DEMO_KNOWLEDGE[p.key],
    key: p.key,
    confidence: p.confidence
  }));
}

/* ---------- Procedural sample leaves (drawn on canvas) ---------- */

function drawSampleLeaf(canvas, type) {
  const ctx = canvas.getContext('2d');
  const s = canvas.width;
  ctx.clearRect(0, 0, s, s);

  // leaf silhouette
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.42, s * 0.52, 0, 0, Math.PI * 2);
  ctx.fillStyle = baseColor(type);
  ctx.fill();
  ctx.closePath();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-s * 0.36, s * 0.2);
  ctx.lineTo(s * 0.36, s * 0.2);
  ctx.fill();
  ctx.restore();

  // vein
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s / 2, s / 2);
  ctx.lineTo(s / 2, s * 0.05);
  ctx.stroke();

  // disease spots
  drawSpots(ctx, type, s);
}

function baseColor(type) {
  if (type === 'tomato') return '#7cb342';
  if (type === 'potato') return '#66a34d';
  return '#8bc34a';
}

function drawSpots(ctx, type, s) {
  const spots = [];
  if (type === 'tomato') {
    // early blight bullseyes
    spots.push({ x: 0.30, y: 0.38, r: 8, cols: ['#7a4a21', '#b0803a'] });
    spots.push({ x: 0.68, y: 0.62, r: 6, cols: ['#7a4a21', '#b0803a'] });
    spots.push({ x: 0.55, y: 0.20, r: 5, cols: ['#7a4a21', '#b0803a'] });
  } else if (type === 'potato') {
    // late blight dark jagged lesions
    for (let i = 0; i < 7; i++) {
      spots.push({ x: 0.2 + Math.random() * 0.6, y: 0.25 + Math.random() * 0.5, r: 4 + Math.random() * 5, cols: ['#3b2a1a', '#5d4632', '#1e1410'] });
    }
  } else {
    // corn rust pustules
    for (let i = 0; i < 10; i++) {
      spots.push({ x: 0.12 + Math.random() * 0.76, y: 0.12 + Math.random() * 0.76, r: 2 + Math.random() * 2.5, cols: ['#a0522d', '#c96f2c'] });
    }
  }
  spots.forEach((sp) => {
    const col = sp.cols[Math.floor(Math.random() * sp.cols.length)];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sp.x * s, sp.y * s, sp.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

const SAMPLES = [
  { canvasId: 'sampleTomato', type: 'tomato', disease: 'tomato_early_blight' },
  { canvasId: 'samplePotato', type: 'potato', disease: 'potato_late_blight' },
  { canvasId: 'sampleCorn', type: 'corn', disease: 'corn_common_rust' }
];

function initSamples() {
  SAMPLES.forEach((s) => {
    const canvas = document.getElementById(s.canvasId);
    if (canvas) drawSampleLeaf(canvas, s.type);
  });
}

/* ---------- Exposed API ---------- */
window.AgriCare = {
  demoPredict,
  initSamples,
  SAMPLES
};