import { PI, latitudeBand, percentileFromHistogram, pixelGeo, rowLatitude, rowWeight } from "./analysis-math.js";

function heightEvidence(data) {
  const lines = [];
  if (!data.nonZeroPixels) return ["No non-zero elevation pixels were detected."];
  const reliefClass = data.relief >= 180 ? "very high" : data.relief >= 110 ? "high" : data.relief >= 50 ? "moderate" : "low";
  lines.push(`The encoded land has ${reliefClass} grayscale relief (${data.relief} levels).`);
  if (data.terrainCoverage?.mountains + data.terrainCoverage?.peaks >= 0.35) lines.push("A large share of encoded land occupies mountain or peak elevation bands.");
  else if (data.terrainCoverage?.lowlands >= 0.6) lines.push("Most encoded land occupies the lowland elevation band.");
  if (data.localRelief?.ridgeShare > 0.2) lines.push("Local-neighborhood analysis finds a strong ridge signal.");
  if (data.nearBlackLand?.share1to8 > 0.05) lines.push("Many land pixels sit near black and may be vulnerable to being interpreted as ocean after resampling or compression.");
  if (data.clippedPeakShare > 0.05) lines.push("A noticeable peak share is clipped at 255, limiting recoverable high-elevation detail.");
  if (data.anomalyFlags?.length) lines.push(`Automated anomaly flags: ${data.anomalyFlags.join(", ")}.`);
  return lines;
}

function heightProfile(data) {
  return {
    relief: data.relief >= 180 ? "very-high" : data.relief >= 110 ? "high" : data.relief >= 50 ? "moderate" : "low",
    dominantTerrainBand: Object.entries(data.terrainCoverage || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown",
    roughness: data.terrainRoughness >= 24 ? "high" : data.terrainRoughness >= 10 ? "moderate" : "low",
    elevationDiversity: data.elevationEntropy >= 6 ? "high" : data.elevationEntropy >= 4 ? "moderate" : "low",
    oceanIntegrityRisk: data.nearBlackLand?.share1to8 > 0.05 ? "near-black-land" : "low",
    peakClippingRisk: data.clippedPeakShare > 0.05 ? "high" : data.clippedPeakShare > 0.005 ? "moderate" : "low",
  };
}

function visualEvidence(data) {
  const lines = [];
  if (data.analysisHints?.includes("likely-binary-mask")) lines.push("Raster structure strongly resembles a binary mask.");
  else if (data.analysisHints?.includes("likely-grayscale-heightmap")) lines.push("Raster structure strongly resembles a grayscale heightmap.");
  else if (data.averageSaturation > 0.25) lines.push("The image is color-rich and is more likely a visual, climate, satellite, or classified layer than a raw elevation field.");
  if (data.equirectangularStatus !== "exact-2:1") lines.push("The image is not exact 2:1 and requires explicit normalization before spherical heightmap use.");
  if (data.transparencyShare > 0) lines.push("Transparent pixels are present and should be resolved before deterministic raster processing.");
  if (data.paletteConcentration > 0.8 && data.quantizedColorCount < 64) lines.push("A small dominant palette suggests a classified or categorical map, but class meanings require a supplied legend.");
  return lines;
}

function visualProfile(data) {
  return {
    likelyRole: data.analysisHints?.includes("likely-binary-mask") ? "binary-mask"
      : data.analysisHints?.includes("likely-grayscale-heightmap") ? "grayscale-heightmap"
        : data.averageSaturation > 0.25 ? "color-raster" : "low-saturation-raster",
    projectionReadiness: data.equirectangularStatus === "exact-2:1" ? "ready" : "requires-normalization",
    paletteStructure: data.paletteConcentration > 0.8 && data.quantizedColorCount < 64 ? "categorical-like"
      : data.colorEntropy > 8 ? "highly-varied" : "moderately-varied",
    textureStructure: data.textureComplexity >= 20 ? "high-detail" : data.textureComplexity >= 8 ? "moderate-detail" : "smooth",
  };
}

function connectedHighlands(gray, width, height, threshold) {
  const visited = new Uint8Array(gray.length); const queue = new Int32Array(gray.length);
  let count = 0, largest = 0, pixels = 0;
  for (let start = 0; start < gray.length; start += 1) {
    if (gray[start] < threshold || visited[start]) continue;
    count += 1; let head = 0, tail = 0; queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const index = queue[head++]; pixels += 1;
      const x = index % width; const y = Math.floor(index / width);
      const neighbors = [
        y * width + ((x - 1 + width) % width), y * width + ((x + 1) % width),
        y > 0 ? index - width : -1, y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbors) if (next >= 0 && gray[next] >= threshold && !visited[next]) {
        visited[next] = 1; queue[tail++] = next;
      }
    }
    largest = Math.max(largest, tail);
  }
  return { count, pixels, largest, largestShare: pixels ? largest / pixels : 0 };
}

export function analyzeHeightmap(gray, width, height) {
  const histogram = new Uint32Array(256); const gradientHistogram = new Uint32Array(256);
  const latitudeElevation = { tropical: { sum: 0, weight: 0 }, midLatitude: { sum: 0, weight: 0 }, polar: { sum: 0, weight: 0 } };
  let nonZero = 0, sum = 0, sumSquares = 0, weightedSum = 0, weightedLand = 0, weightedWorld = 0;
  let minimum = 255, maximum = 0, nearBlack3 = 0, nearBlack8 = 0, clipped = 0;
  let gradientSum = 0, gradientCount = 0, ridge = 0, valley = 0, flat = 0, localCount = 0;
  let peakCandidates = 0, highestIndex = -1, circleX = 0, circleY = 0, weightedLat = 0;
  for (let y = 0; y < height; y += 1) weightedWorld += rowWeight(y, height) * width;
  for (let index = 0; index < gray.length; index += 1) {
    const value = gray[index]; histogram[value] += 1; if (!value) continue;
    const x = index % width; const y = Math.floor(index / width); const weight = rowWeight(y, height);
    const latitude = rowLatitude(y, height); const band = latitudeBand(latitude);
    nonZero += 1; sum += value; sumSquares += value * value; weightedSum += value * weight; weightedLand += weight;
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
    nearBlack3 += value <= 3 ? 1 : 0; nearBlack8 += value <= 8 ? 1 : 0; clipped += value === 255 ? 1 : 0;
    latitudeElevation[band].sum += value * weight; latitudeElevation[band].weight += weight;
    const angle = (x + 0.5) / width * PI * 2; circleX += Math.cos(angle) * value * weight;
    circleY += Math.sin(angle) * value * weight; weightedLat += latitude * value * weight;
    if (value === maximum) highestIndex = index;
    const right = y * width + ((x + 1) % width); const down = y + 1 < height ? index + width : -1;
    for (const next of [right, down]) if (next >= 0 && gray[next]) {
      const difference = Math.abs(value - gray[next]); gradientSum += difference; gradientCount += 1;
      gradientHistogram[Math.min(255, difference)] += 1;
    }
  }
  const mean = nonZero ? sum / nonZero : 0;
  const stdDev = nonZero ? Math.sqrt(Math.max(0, sumSquares / nonZero - mean * mean)) : 0;
  const p25 = percentileFromHistogram(histogram, nonZero, 0.25, 1);
  const p75 = percentileFromHistogram(histogram, nonZero, 0.75, 1);
  const p95 = percentileFromHistogram(histogram, nonZero, 0.95, 1);
  for (let index = 0; index < gray.length; index += 1) {
    const value = gray[index]; if (!value) continue;
    const x = index % width; const y = Math.floor(index / width); let neighborSum = 0, neighbors = 0;
    let localMaximum = value >= p95;
    for (let oy = -1; oy <= 1; oy += 1) {
      const yy = y + oy; if (yy < 0 || yy >= height) continue;
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const xx = (x + ox + width) % width; const nextValue = gray[yy * width + xx];
        if (!nextValue) continue;
        neighborSum += nextValue; neighbors += 1; if (nextValue > value) localMaximum = false;
      }
    }
    if (!neighbors) continue;
    const position = value - neighborSum / neighbors;
    if (position > 6) ridge += 1; else if (position < -6) valley += 1; else flat += 1;
    localCount += 1; if (localMaximum) peakCandidates += 1;
  }
  const relief = maximum - (nonZero ? minimum : 0);
  let entropy = 0;
  if (nonZero) for (let value = 1; value < 256; value += 1) if (histogram[value]) {
    const probability = histogram[value] / nonZero; entropy -= probability * Math.log2(probability);
  }
  const percentile = (fraction) => percentileFromHistogram(histogram, nonZero, fraction, 1);
  const highlands = connectedHighlands(gray, width, height, Math.max(1, p75));
  let centerAngle = Math.atan2(circleY, circleX); if (centerAngle < 0) centerAngle += PI * 2;
  const bands = {};
  for (const [key, record] of Object.entries(latitudeElevation)) bands[key] = record.weight ? record.sum / record.weight : 0;
  const anomalyFlags = [];
  const coverage = nonZero / Math.max(1, gray.length);
  if (coverage > 0.80) anomalyFlags.push("global-elevation");
  if (nonZero && relief < 16) anomalyFlags.push("low-relief");
  if (nonZero && clipped / nonZero > 0.05) anomalyFlags.push("clipped-peaks");
  if (nonZero && nearBlack8 / nonZero > 0.05) anomalyFlags.push("near-black-land-risk");
  const data = {
    width, height, nonZeroPixels: nonZero, landCoverage: coverage,
    sphericalLandCoverage: weightedLand / Math.max(1, weightedWorld),
    minimumLand: nonZero ? minimum : 0, maximumElevation: maximum, relief,
    averageLandElevation: mean, areaWeightedMeanElevation: weightedLand ? weightedSum / weightedLand : 0,
    elevationStdDev: stdDev,
    terrainContrastP90P10: percentile(0.90) - percentile(0.10),
    hypsometricIntegral: relief ? (mean - minimum) / relief : 0,
    elevationEntropy: entropy,
    elevationPercentiles: {
      p05: percentile(0.05), p10: percentile(0.10), p25,
      p50: percentile(0.50), p75, p90: percentile(0.90), p95, p99: percentile(0.99),
    },
    terrainCoverage: {
      lowlands: nonZero ? histogram.slice(1, 65).reduce((a, b) => a + b, 0) / nonZero : 0,
      hills: nonZero ? histogram.slice(65, 129).reduce((a, b) => a + b, 0) / nonZero : 0,
      mountains: nonZero ? histogram.slice(129, 201).reduce((a, b) => a + b, 0) / nonZero : 0,
      peaks: nonZero ? histogram.slice(201).reduce((a, b) => a + b, 0) / nonZero : 0,
    },
    terrainRoughness: gradientCount ? gradientSum / gradientCount : 0,
    slopeProxy: {
      mean: gradientCount ? gradientSum / gradientCount : 0,
      p90: percentileFromHistogram(gradientHistogram, gradientCount, 0.90),
      p99: percentileFromHistogram(gradientHistogram, gradientCount, 0.99),
    },
    localRelief: {
      ridgeShare: localCount ? ridge / localCount : 0,
      valleyShare: localCount ? valley / localCount : 0,
      flatShare: localCount ? flat / localCount : 0,
      peakCandidateCount: peakCandidates,
    },
    highlandRegions: highlands,
    nearBlackLand: { values1to3: nearBlack3, values1to8: nearBlack8, share1to8: nonZero ? nearBlack8 / nonZero : 0 },
    clippedPeakShare: nonZero ? clipped / nonZero : 0,
    highestPoint: highestIndex >= 0 ? { value: maximum, ...pixelGeo(highestIndex % width, Math.floor(highestIndex / width), width, height) } : null,
    elevationCenter: nonZero ? {
      longitude: centerAngle / (PI * 2) * 360 - 180,
      latitude: weightedLat / Math.max(1, weightedSum),
    } : null,
    latitudinalMeanElevation: bands,
    histogram: Array.from({ length: 16 }, (_, bucket) => {
      let count = 0; for (let value = bucket * 16; value < bucket * 16 + 16; value += 1) count += histogram[value]; return count;
    }),
    anomalyFlags,
    anomaly: anomalyFlags.includes("global-elevation")
      ? "Global-elevation anomaly: most ocean pixels contain non-zero elevation." : null,
  };
  data.contextProfile = heightProfile(data);
  data.evidenceSummary = heightEvidence(data);
  return data;
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function analyzeVisual(rgba, width, height) {
  const luminanceHistogram = new Uint32Array(256); const colorBins = new Uint32Array(4096);
  let count = 0, alphaPixels = 0, grayPixels = 0, nearBlack = 0, bright = 0, exactBlack = 0, exactWhite = 0;
  let lumSum = 0, lumSquares = 0, saturationSum = 0, edgeSum = 0, edgeCount = 0;
  const channelSum = [0, 0, 0]; const channelSquares = [0, 0, 0];
  const luminance = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4; const red = rgba[offset]; const green = rgba[offset + 1]; const blue = rgba[offset + 2]; const alpha = rgba[offset + 3];
    const maximum = Math.max(red, green, blue); const minimum = Math.min(red, green, blue);
    const value = Math.round(0.299 * red + 0.587 * green + 0.114 * blue); luminance[index] = value;
    luminanceHistogram[value] += 1; lumSum += value; lumSquares += value * value; count += 1;
    channelSum[0] += red; channelSum[1] += green; channelSum[2] += blue;
    channelSquares[0] += red * red; channelSquares[1] += green * green; channelSquares[2] += blue * blue;
    saturationSum += maximum ? (maximum - minimum) / maximum : 0;
    alphaPixels += alpha < 255 ? 1 : 0; grayPixels += maximum - minimum <= 3 ? 1 : 0;
    nearBlack += value <= 8 ? 1 : 0; bright += value >= 247 ? 1 : 0;
    exactBlack += red === 0 && green === 0 && blue === 0 ? 1 : 0;
    exactWhite += red === 255 && green === 255 && blue === 255 ? 1 : 0;
    colorBins[((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4)] += 1;
  }
  const gradientHistogram = new Uint32Array(256);
  for (let index = 0; index < luminance.length; index += 1) {
    const x = index % width; const y = Math.floor(index / width);
    const right = y * width + ((x + 1) % width); const down = y + 1 < height ? index + width : -1;
    for (const next of [right, down]) if (next >= 0) {
      const difference = Math.abs(luminance[index] - luminance[next]); edgeSum += difference; edgeCount += 1; gradientHistogram[difference] += 1;
    }
  }
  const colors = [];
  for (let bin = 0; bin < colorBins.length; bin += 1) if (colorBins[bin]) colors.push([bin, colorBins[bin]]);
  colors.sort((a, b) => b[1] - a[1]);
  const dominantColors = colors.slice(0, 8).map(([bin, pixels]) => {
    const red = (((bin >> 8) & 15) << 4) + 8; const green = (((bin >> 4) & 15) << 4) + 8; const blue = ((bin & 15) << 4) + 8;
    return { hex: rgbToHex(red, green, blue), pixels, share: pixels / count };
  });
  let colorEntropy = 0;
  for (const [, pixels] of colors) { const probability = pixels / count; colorEntropy -= probability * Math.log2(probability); }
  const meanLuminance = lumSum / Math.max(1, count);
  const channelStats = channelSum.map((sum, channel) => ({
    mean: sum / Math.max(1, count),
    stdDev: Math.sqrt(Math.max(0, channelSquares[channel] / Math.max(1, count) - (sum / Math.max(1, count)) ** 2)),
  }));
  const hints = [];
  if (grayPixels / count > 0.98 && colors.length <= 4) hints.push("likely-binary-mask");
  else if (grayPixels / count > 0.98) hints.push("likely-grayscale-heightmap");
  if (width / height > 1.99 && width / height < 2.01) hints.push("2-to-1-equirectangular");
  const data = {
    width, height, megapixels: count / 1_000_000, aspectRatio: width / height,
    equirectangularStatus: Math.abs(width / height - 2) < 0.001 ? "exact-2:1" : "non-2:1",
    aspectRatioErrorFrom2To1: Math.abs(width / height - 2),
    pixelCount: count,
    transparencyShare: alphaPixels / Math.max(1, count),
    grayscaleShare: grayPixels / Math.max(1, count),
    nearBlackShare: nearBlack / Math.max(1, count),
    brightShare: bright / Math.max(1, count),
    exactBlackShare: exactBlack / Math.max(1, count),
    exactWhiteShare: exactWhite / Math.max(1, count),
    luminance: {
      mean: meanLuminance,
      stdDev: Math.sqrt(Math.max(0, lumSquares / Math.max(1, count) - meanLuminance ** 2)),
      p05: percentileFromHistogram(luminanceHistogram, count, 0.05),
      p50: percentileFromHistogram(luminanceHistogram, count, 0.50),
      p95: percentileFromHistogram(luminanceHistogram, count, 0.95),
      dynamicRange: percentileFromHistogram(luminanceHistogram, count, 0.95) - percentileFromHistogram(luminanceHistogram, count, 0.05),
    },
    averageSaturation: saturationSum / Math.max(1, count),
    channelStats: { red: channelStats[0], green: channelStats[1], blue: channelStats[2] },
    quantizedColorCount: colors.length,
    colorEntropy,
    paletteConcentration: dominantColors.slice(0, 5).reduce((sum, color) => sum + color.share, 0),
    dominantColors,
    textureComplexity: edgeCount ? edgeSum / edgeCount : 0,
    edgeP90: percentileFromHistogram(gradientHistogram, edgeCount, 0.90),
    analysisHints: hints,
  };
  data.contextProfile = visualProfile(data);
  data.evidenceSummary = visualEvidence(data);
  return data;
}

export function compareVisuals(a, b) {
  const pixels = Math.min(a.length, b.length) / 4;
  let lumA = 0, lumB = 0, lumAA = 0, lumBB = 0, lumAB = 0;
  let absolute = 0, squared = 0, changed = 0, channelAbsolute = 0;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const first = 0.299 * a[offset] + 0.587 * a[offset + 1] + 0.114 * a[offset + 2];
    const second = 0.299 * b[offset] + 0.587 * b[offset + 1] + 0.114 * b[offset + 2];
    const difference = second - first; const magnitude = Math.abs(difference);
    lumA += first; lumB += second; lumAA += first * first; lumBB += second * second; lumAB += first * second;
    absolute += magnitude; squared += difference * difference; changed += magnitude >= 10 ? 1 : 0;
    channelAbsolute += Math.abs(a[offset] - b[offset]) + Math.abs(a[offset + 1] - b[offset + 1]) + Math.abs(a[offset + 2] - b[offset + 2]);
  }
  const numerator = pixels * lumAB - lumA * lumB;
  const denominator = Math.sqrt(Math.max(0, (pixels * lumAA - lumA * lumA) * (pixels * lumBB - lumB * lumB)));
  return {
    comparedPixels: pixels,
    meanAbsoluteLuminanceDifference: pixels ? absolute / pixels : 0,
    rootMeanSquareLuminanceDifference: pixels ? Math.sqrt(squared / pixels) : 0,
    luminanceCorrelation: denominator ? numerator / denominator : 0,
    meanAbsoluteChannelDifference: pixels ? channelAbsolute / (pixels * 3) : 0,
    materiallyChangedPixelShare: pixels ? changed / pixels : 0,
  };
}

export function compareHeightmaps(a, b) {
  let shared = 0, sumAbs = 0, sumSquares = 0, sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0, bias = 0;
  let landA = 0, landB = 0;
  for (let index = 0; index < a.length; index += 1) {
    landA += a[index] > 0 ? 1 : 0; landB += b[index] > 0 ? 1 : 0;
    if (!a[index] || !b[index]) continue;
    const av = a[index], bv = b[index], difference = bv - av;
    shared += 1; sumAbs += Math.abs(difference); sumSquares += difference * difference; bias += difference;
    sumA += av; sumB += bv; sumAA += av * av; sumBB += bv * bv; sumAB += av * bv;
  }
  const numerator = shared * sumAB - sumA * sumB;
  const denominator = Math.sqrt(Math.max(0, (shared * sumAA - sumA * sumA) * (shared * sumBB - sumB * sumB)));
  return {
    sharedLandPixels: shared,
    sharedLandShareOfA: landA ? shared / landA : 0,
    sharedLandShareOfB: landB ? shared / landB : 0,
    meanAbsoluteError: shared ? sumAbs / shared : 0,
    rootMeanSquareError: shared ? Math.sqrt(sumSquares / shared) : 0,
    meanBiasBMinusA: shared ? bias / shared : 0,
    correlation: denominator ? numerator / denominator : 0,
  };
}
