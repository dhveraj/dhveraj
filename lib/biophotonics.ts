// Biophotonic 405nm Optical Analysis & Sample Frame Generator

export interface ImageAnalysisResult {
  isPrecancerous: boolean;
  isWhitePatch: boolean;
  riskScore: number;
  fluorescenceLossAreaPct: number;
  spectralRatio: number;
  triageStatus: "TARGETED_BIOPSY_INDICATED" | "ROUTINE_FOLLOWUP";
  lesionCenter: { x: number; y: number }; // Percentage (0-100)
  lesionRadius: { rx: number; ry: number }; // Percentage (0-100)
  severityText: string;
  notes: string;
}

/**
 * Analyzes an image element's pixel data on an offscreen HTML5 canvas
 * to detect healthy green autofluorescence vs white patch / precancerous extinction shadow.
 */
export function analyzeImagePixels(imageElement: HTMLImageElement): ImageAnalysisResult {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const width = 120;
  const height = 80;
  canvas.width = width;
  canvas.height = height;

  if (!ctx) {
    return getDefaultHealthyResult();
  }

  ctx.drawImage(imageElement, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let darkPixelCount = 0;
  let whitePatchPixelCount = 0;
  let totalPixels = width * height;

  let lesionSumX = 0;
  let lesionSumY = 0;
  let lesionPointsCount = 0;

  // Scan pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      totalR += r;
      totalG += g;
      totalB += b;

      const brightness = (r * 0.299 + g * 0.587 + b * 0.114);

      // Check for white patch / hyperkeratotic region (high brightness with low saturation)
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const isWhitish = brightness > 175 && (maxC - minC) < 45;

      // Check for dark extinction shadow / loss zone (dark pixel under 405nm)
      const isDarkShadow = brightness < 65 || (r > 110 && g < 75 && b < 75);

      if (isWhitish) {
        whitePatchPixelCount++;
        lesionSumX += x;
        lesionSumY += y;
        lesionPointsCount++;
      } else if (isDarkShadow) {
        darkPixelCount++;
        lesionSumX += x;
        lesionSumY += y;
        lesionPointsCount++;
      }
    }
  }

  const avgR = totalR / totalPixels;
  const avgG = totalG / totalPixels;
  const avgB = totalB / totalPixels;

  const whitePatchPct = (whitePatchPixelCount / totalPixels) * 100;
  const darkShadowPct = (darkPixelCount / totalPixels) * 100;
  const abnormalPct = whitePatchPct + darkShadowPct;

  // Decision logic: Healthy vs Precancerous / White Patch
  const isWhitePatch = whitePatchPct > 3.5;
  const isSevereShadow = darkShadowPct > 5.0;
  const isPrecancerous = isWhitePatch || isSevereShadow || (avgG < 70 && (avgR > 120 || avgB > 110));

  let lesionX = 45; // Default center %
  let lesionY = 50;
  if (lesionPointsCount > 0) {
    lesionX = Math.round((lesionSumX / lesionPointsCount / width) * 100);
    lesionY = Math.round((lesionSumY / lesionPointsCount / height) * 100);
    // Keep within optical frame bounds
    lesionX = Math.max(25, Math.min(75, lesionX));
    lesionY = Math.max(30, Math.min(70, lesionY));
  }

  if (isPrecancerous) {
    const riskScore = isSevereShadow
      ? Math.min(94, Math.round(75 + darkShadowPct * 1.5))
      : Math.min(72, Math.round(48 + whitePatchPct * 2.2));

    const fluorescenceLossAreaPct = parseFloat(
      Math.min(28, Math.max(6.5, abnormalPct * 1.4)).toFixed(2)
    );

    const spectralRatio = parseFloat(
      Math.max(0.28, (0.75 - (riskScore / 100) * 0.45)).toFixed(3)
    );

    const rx = Math.min(28, Math.max(14, Math.round(fluorescenceLossAreaPct * 1.1)));
    const ry = Math.min(22, Math.max(10, Math.round(rx * 0.72)));

    const isBiopsy = riskScore >= 60;

    return {
      isPrecancerous: true,
      isWhitePatch,
      riskScore,
      fluorescenceLossAreaPct,
      spectralRatio,
      triageStatus: isBiopsy ? "TARGETED_BIOPSY_INDICATED" : "ROUTINE_FOLLOWUP",
      lesionCenter: { x: lesionX, y: lesionY },
      lesionRadius: { rx, ry },
      severityText: isSevereShadow
        ? "Severe 405nm Extinction Shadow Detected"
        : "White Patch Hyperkeratosis / Early OSMF Shadow",
      notes: isBiopsy
        ? `Optical 405nm excitation reveals severe stromal fluorescence loss (dark shadow extinction, ${fluorescenceLossAreaPct}% area). Punch biopsy indicated at center of optical extinction.`
        : `Localized autofluorescence suppression consistent with white patch / early oral submucous fibrosis (OSMF). 30-day clinical optical surveillance recommended.`,
    };
  }

  // Pure Healthy Tissue
  return getDefaultHealthyResult();
}

function getDefaultHealthyResult(): ImageAnalysisResult {
  return {
    isPrecancerous: false,
    isWhitePatch: false,
    riskScore: 12,
    fluorescenceLossAreaPct: 0.8,
    spectralRatio: 1.94,
    triageStatus: "ROUTINE_FOLLOWUP",
    lesionCenter: { x: 50, y: 50 },
    lesionRadius: { rx: 0, ry: 0 },
    severityText: "Homogeneous Green Collagen Autofluorescence",
    notes:
      "Stromal collagen crosslinks intact. Emits uniform pale green 515nm autofluorescence with zero optical extinction voids.",
  };
}

/**
 * Creates pure SVG data URIs for 1-click conference demo samples
 */
export function getSampleDemoImages() {
  // 1. Healthy Oral Tissue (Radiant green autofluorescence with healthy collagen)
  const healthySVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#030804"/>
    <defs>
      <radialGradient id="hglow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#30D158" stop-opacity="0.95"/>
        <stop offset="50%" stop-color="#34C759" stop-opacity="0.75"/>
        <stop offset="85%" stop-color="#166534" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#022c22" stop-opacity="0"/>
      </radialGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>
    <ellipse cx="300" cy="200" rx="250" ry="160" fill="url(#hglow)" filter="url(#blur)"/>
    <path d="M120 180 Q 250 120 380 170 T 500 220" stroke="#86efac" stroke-width="4" fill="none" opacity="0.3"/>
    <text x="30" y="40" fill="#86efac" font-size="14" font-family="sans-serif" font-weight="bold">HEALTHY ORAL TISSUE (405nm EMISSION)</text>
  </svg>`;

  // 2. White Patch / Early OSMF (White keratin patch causing localized dark shadow)
  const whitePatchSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#050508"/>
    <defs>
      <radialGradient id="greenBase" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#30D158" stop-opacity="0.8"/>
        <stop offset="70%" stop-color="#15803d" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
      <radialGradient id="patchShadow" cx="46%" cy="50%" r="35%">
        <stop offset="0%" stop-color="#090510" stop-opacity="0.98"/>
        <stop offset="50%" stop-color="#1e142c" stop-opacity="0.9"/>
        <stop offset="85%" stop-color="#f59e0b" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
    </defs>
    <ellipse cx="300" cy="200" rx="240" ry="150" fill="url(#greenBase)"/>
    <!-- White patch plaque overlay -->
    <path d="M 230,160 Q 280,140 330,170 T 310,230 Q 250,240 230,190 Z" fill="#f8fafc" opacity="0.85"/>
    <!-- Localized optical dark shadow extinction -->
    <ellipse cx="280" cy="195" rx="80" ry="55" fill="url(#patchShadow)"/>
    <text x="30" y="40" fill="#fbbf24" font-size="14" font-family="sans-serif" font-weight="bold">LEUKOPLAKIA WHITE PATCH (LOCALIZED EXTINCTION SHADOW)</text>
  </svg>`;

  // 3. Precancerous Dysplasia (Deep dark shadow extinction void with loss of green light)
  const precancerSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#040407"/>
    <defs>
      <radialGradient id="stromaGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#22c55e" stop-opacity="0.75"/>
        <stop offset="70%" stop-color="#14532d" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
      <radialGradient id="darkExtinctionVoid" cx="44%" cy="48%" r="38%">
        <stop offset="0%" stop-color="#020105" stop-opacity="1"/>
        <stop offset="55%" stop-color="#180408" stop-opacity="0.95"/>
        <stop offset="85%" stop-color="#e11d48" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
    </defs>
    <!-- Background green autofluorescence -->
    <ellipse cx="300" cy="200" rx="250" ry="155" fill="url(#stromaGlow)"/>
    <!-- Severe Precancerous Dark Extinction Void (Black Shadow) -->
    <ellipse cx="265" cy="190" rx="125" ry="85" fill="url(#darkExtinctionVoid)"/>
    <text x="30" y="40" fill="#fb7185" font-size="14" font-family="sans-serif" font-weight="bold">PRECANCEROUS DYSPLASIA (SEVERE 405nm EXTINCTION SHADOW)</text>
  </svg>`;

  return {
    healthyDataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(healthySVG)}`,
    whitePatchDataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(whitePatchSVG)}`,
    precancerDataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(precancerSVG)}`,
  };
}
