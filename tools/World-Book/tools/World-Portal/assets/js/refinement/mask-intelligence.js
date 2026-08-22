import { PI, latitudeBand, percentileFromHistogram, pixelGeo, rowLatitude, rowWeight } from "./analysis-math.js";

const EMPTY_DISTANCE = 65535;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function coefficientOfVariation(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!mean) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function longitudeExtent(occupiedColumns) {
  const width = occupiedColumns.length;
  const occupied = [];
  for (let x = 0; x < width; x += 1) if (occupiedColumns[x]) occupied.push(x);
  if (!occupied.length) return null;
  if (occupied.length === width) return { spanDegrees: 360, crossesAntimeridian: true, west: -180, east: 180 };
  let largestGap = -1;
  let gapStart = occupied[0];
  for (let index = 0; index < occupied.length; index += 1) {
    const current = occupied[index];
    const next = index + 1 < occupied.length ? occupied[index + 1] : occupied[0] + width;
    const gap = next - current - 1;
    if (gap > largestGap) { largestGap = gap; gapStart = current; }
  }
  const start = (gapStart + largestGap + 1) % width;
  const spanColumns = width - largestGap;
  const west = start / width * 360 - 180;
  const eastRaw = (start + spanColumns) / width * 360 - 180;
  return {
    spanDegrees: spanColumns / width * 360,
    crossesAntimeridian: eastRaw > 180,
    west,
    east: eastRaw > 180 ? eastRaw - 360 : eastRaw,
  };
}

function dominantKey(record) {
  return Object.entries(record).sort((a, b) => b[1] - a[1])[0]?.[0] || "none";
}

function sizePercentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function maskEvidence(data) {
  const lines = [];
  if (!data.landPixels) return ["No land pixels were detected above the selected threshold."];
  if (data.largestLandmassShare >= 0.9) lines.push("One overwhelmingly dominant landmass contains at least 90% of detected land.");
  else if (data.largestLandmassShare >= 0.65) lines.push("One dominant landmass is accompanied by smaller secondary islands or fragments.");
  else lines.push("Detected land is distributed across several substantial landmasses.");
  if (data.tinyIslandShare >= 0.1) lines.push("Tiny components account for a large share of land and may indicate speckle or compression artifacts.");
  else if (data.tinyIslandCount) lines.push("Small detached components exist, but they account for a limited share of total land.");
  if (data.coreDepthShares?.atLeast8 >= 0.5) lines.push("At least half of land lies eight or more pixels inland, indicating a substantial interior core at this resolution.");
  else if (data.coastalPixelShare >= 0.5) lines.push("Most detected land is coastline-adjacent, indicating narrow islands, intricate coastlines, or a low-resolution silhouette.");
  lines.push(`Most area-corrected land lies in the ${data.dominantLatitudeBand || "unknown"} latitude band.`);
  if (data.geographicExtent?.longitude?.crossesAntimeridian) lines.push("The occupied longitude extent crosses the antimeridian and should be treated as seam-connected.");
  if (data.anomalyFlags?.length) lines.push(`Automated anomaly flags: ${data.anomalyFlags.join(", ")}.`);
  return lines;
}

function maskProfile(data) {
  return {
    landDistribution: data.largestLandmassShare >= 0.9 ? "single-overwhelming"
      : data.largestLandmassShare >= 0.65 ? "single-dominant" : "multi-landmass",
    fragmentation: data.tinyIslandShare >= 0.1 || data.landmassCount > 1000 ? "high"
      : data.effectiveLandmassCount > 6 ? "moderate" : "low",
    coastExposure: data.coastalPixelShare >= 0.5 ? "coast-dominated"
      : data.coreDepthShares?.atLeast8 >= 0.5 ? "deep-interior" : "mixed",
    latitudePlacement: data.dominantLatitudeBand || "unknown",
    northSouthPlacement: data.hemisphereShares?.north >= data.hemisphereShares?.south ? "north" : "south",
    eastWestPlacement: data.hemisphereShares?.east >= data.hemisphereShares?.west ? "east" : "west",
    seamStatus: data.geographicExtent?.longitude?.crossesAntimeridian ? "antimeridian-crossing"
      : data.geographicExtent?.seamRows ? "seam-connected" : "not-seam-connected",
  };
}

function componentStats(mask, width, height, tinyThreshold, weights) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0, pixels = 0, weightedArea = 0, perimeter = 0;
    let circleX = 0, circleY = 0, weightedLat = 0;
    let minX = width, maxX = -1, minY = height, maxY = -1;
    let touchesWest = false, touchesEast = false;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width; const y = Math.floor(index / width);
      const weight = weights[y]; const geo = pixelGeo(x, y, width, height);
      const angle = (x + 0.5) / width * PI * 2;
      pixels += 1; weightedArea += weight;
      circleX += Math.cos(angle) * weight; circleY += Math.sin(angle) * weight;
      weightedLat += geo.latitude * weight;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      touchesWest ||= x === 0; touchesEast ||= x === width - 1;
      const neighbors = [
        y * width + ((x - 1 + width) % width),
        y * width + ((x + 1) % width),
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || !mask[next]) perimeter += 1;
        else if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    let angle = Math.atan2(circleY, circleX); if (angle < 0) angle += PI * 2;
    components.push({
      pixelCount: pixels,
      weightedArea,
      perimeterEdges: perimeter,
      compactness: perimeter ? Math.min(1, (4 * PI * pixels) / (perimeter * perimeter)) : 0,
      centroid: {
        x: angle / (PI * 2) * width,
        y: (90 - weightedLat / weightedArea) / 180 * height,
        longitude: angle / (PI * 2) * 360 - 180,
        latitude: weightedLat / weightedArea,
      },
      bbox: { minX, minY, maxX, maxY },
      crossesAntimeridian: touchesWest && touchesEast,
      tiny: pixels < tinyThreshold,
    });
  }
  return components.sort((a, b) => b.pixelCount - a.pixelCount);
}

function coastDepth(mask, width, height) {
  const distance = new Uint16Array(mask.length); distance.fill(EMPTY_DISTANCE);
  const queue = new Int32Array(mask.length); let head = 0, tail = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width; const y = Math.floor(index / width);
    const neighbors = [
      y * width + ((x - 1 + width) % width), y * width + ((x + 1) % width),
      y > 0 ? index - width : -1, y + 1 < height ? index + width : -1,
    ];
    if (neighbors.some((next) => next < 0 || !mask[next])) {
      distance[index] = 0; queue[tail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++]; const x = index % width; const y = Math.floor(index / width);
    const nextDistance = distance[index] + 1;
    const neighbors = [
      y * width + ((x - 1 + width) % width), y * width + ((x + 1) % width),
      y > 0 ? index - width : -1, y + 1 < height ? index + width : -1,
    ];
    for (const next of neighbors) {
      if (next >= 0 && mask[next] && distance[next] === EMPTY_DISTANCE) {
        distance[next] = nextDistance; queue[tail++] = next;
      }
    }
  }
  const histogram = new Uint32Array(Math.max(width, height) + 1);
  let sum = 0, count = 0, maximum = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const value = distance[index] === EMPTY_DISTANCE ? 0 : distance[index];
    histogram[Math.min(histogram.length - 1, value)] += 1;
    sum += value; count += 1; maximum = Math.max(maximum, value);
  }
  const shareAtLeast = (minimum) => {
    if (!count) return 0;
    let pixels = 0;
    for (let value = minimum; value < histogram.length; value += 1) pixels += histogram[value];
    return pixels / count;
  };
  return {
    meanPixels: count ? sum / count : 0,
    medianPixels: percentileFromHistogram(histogram, count, 0.5),
    p90Pixels: percentileFromHistogram(histogram, count, 0.9),
    maximumPixels: maximum,
    shares: {
      atLeast2: shareAtLeast(2), atLeast4: shareAtLeast(4),
      atLeast8: shareAtLeast(8), atLeast16: shareAtLeast(16),
    },
  };
}

export function analyzeMask(gray, width, height, threshold = 0, tinyThreshold = 100) {
  const mask = new Uint8Array(gray.length);
  const weights = new Float64Array(height);
  let totalWeightedArea = 0;
  for (let y = 0; y < height; y += 1) { weights[y] = rowWeight(y, height); totalWeightedArea += weights[y] * width; }
  const occupiedColumns = new Uint8Array(width);
  const latitudeShares = { tropical: 0, midLatitude: 0, polar: 0 };
  const hemisphereShares = { north: 0, south: 0, east: 0, west: 0 };
  let landPixels = 0, weightedLandArea = 0, coastlineEdges = 0, corePixels = 0, coastalPixels = 0;
  let circleX = 0, circleY = 0, weightedLat = 0, minY = height, maxY = -1;
  let touchesNorthPole = false, touchesSouthPole = false, seamRows = 0;
  for (let index = 0; index < gray.length; index += 1) mask[index] = gray[index] > threshold ? 1 : 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width; const y = Math.floor(index / width);
    const weight = weights[y]; const geo = pixelGeo(x, y, width, height);
    const angle = (x + 0.5) / width * PI * 2;
    landPixels += 1; weightedLandArea += weight; occupiedColumns[x] = 1;
    circleX += Math.cos(angle) * weight; circleY += Math.sin(angle) * weight;
    weightedLat += geo.latitude * weight; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    latitudeShares[latitudeBand(geo.latitude)] += weight;
    hemisphereShares[geo.latitude >= 0 ? "north" : "south"] += weight;
    hemisphereShares[geo.longitude >= 0 ? "east" : "west"] += weight;
    touchesNorthPole ||= y === 0; touchesSouthPole ||= y === height - 1;
    const neighbors = [
      y * width + ((x - 1 + width) % width), y * width + ((x + 1) % width),
      y > 0 ? index - width : -1, y + 1 < height ? index + width : -1,
    ];
    let fullyInterior = true;
    for (const next of neighbors) {
      if (next < 0 || !mask[next]) { coastlineEdges += 1; fullyInterior = false; }
    }
    if (fullyInterior) corePixels += 1;
    else coastalPixels += 1;
  }
  for (let y = 0; y < height; y += 1) if (mask[y * width] && mask[y * width + width - 1]) seamRows += 1;
  const components = componentStats(mask, width, height, tinyThreshold, weights);
  const sizes = components.map((component) => component.pixelCount);
  const tinyPixels = components.filter((component) => component.tiny).reduce((sum, component) => sum + component.pixelCount, 0);
  const largest = components[0]?.pixelCount || 0;
  const top3 = components.slice(0, 3).reduce((sum, component) => sum + component.pixelCount, 0);
  const proportions = landPixels ? sizes.map((size) => size / landPixels) : [];
  const effectiveLandmassCount = proportions.length
    ? 1 / proportions.reduce((sum, proportion) => sum + proportion * proportion, 0) : 0;
  const extent = longitudeExtent(occupiedColumns);
  let centroidAngle = Math.atan2(circleY, circleX); if (centroidAngle < 0) centroidAngle += PI * 2;
  const centroid = landPixels ? {
    x: centroidAngle / (PI * 2) * width,
    y: (90 - weightedLat / weightedLandArea) / 180 * height,
    longitude: centroidAngle / (PI * 2) * 360 - 180,
    latitude: weightedLat / weightedLandArea,
  } : null;
  const latitudeTotal = Object.values(latitudeShares).reduce((sum, value) => sum + value, 0) || 1;
  for (const key of Object.keys(latitudeShares)) latitudeShares[key] /= latitudeTotal;
  const northSouth = hemisphereShares.north + hemisphereShares.south || 1;
  const eastWest = hemisphereShares.east + hemisphereShares.west || 1;
  hemisphereShares.north /= northSouth; hemisphereShares.south /= northSouth;
  hemisphereShares.east /= eastWest; hemisphereShares.west /= eastWest;
  const anomalyFlags = [];
  const pixelCoverage = landPixels / Math.max(1, mask.length);
  const sphericalCoverage = weightedLandArea / Math.max(1, totalWeightedArea);
  if (pixelCoverage > 0.80) anomalyFlags.push("global-land");
  if (pixelCoverage < 0.00005) anomalyFlags.push("near-empty");
  if (components.length > 1000) anomalyFlags.push("extreme-fragmentation");
  if (landPixels && tinyPixels / landPixels > 0.10) anomalyFlags.push("micro-island-heavy");
  if (seamRows && extent?.spanDegrees < 180) anomalyFlags.push("possible-seam-artifacts");
  const depth = coastDepth(mask, width, height);
  const data = {
    width, height, landPixels, weightedLandArea, totalWeightedArea,
    landCoverage: pixelCoverage,
    sphericalLandCoverage: sphericalCoverage,
    landmassCount: components.length,
    tinyIslandCount: components.filter((component) => component.tiny).length,
    tinyIslandPixels: tinyPixels,
    tinyIslandShare: landPixels ? tinyPixels / landPixels : 0,
    largestLandmass: largest,
    largestLandmassShare: landPixels ? largest / landPixels : 0,
    topThreeLandmassShare: landPixels ? top3 / landPixels : 0,
    effectiveLandmassCount,
    meanLandmassSize: sizes.length ? landPixels / sizes.length : 0,
    medianLandmassSize: median(sizes),
    landmassSizeP90: sizePercentile(sizes, 0.90),
    landmassSizeVariation: coefficientOfVariation(sizes),
    patchDensityPerMegapixel: components.length / Math.max(1, mask.length) * 1_000_000,
    fragmentationIndex: landPixels ? 1 - largest / landPixels : 0,
    coastlineEdges,
    coastlineComplexity: landPixels ? coastlineEdges / Math.sqrt(landPixels) : 0,
    edgeDensity: landPixels ? coastlineEdges / landPixels : 0,
    coreLandShare: landPixels ? corePixels / landPixels : 0,
    coastalPixelShare: landPixels ? coastalPixels / landPixels : 0,
    coreDepthShares: depth.shares,
    coastDepth: depth,
    centroid,
    geographicExtent: {
      longitude: extent,
      south: maxY >= 0 ? rowLatitude(maxY, height) : null,
      north: minY < height ? rowLatitude(minY, height) : null,
      latitudeSpanDegrees: maxY >= 0 ? Math.abs(rowLatitude(minY, height) - rowLatitude(maxY, height)) : 0,
      touchesNorthPole, touchesSouthPole,
      seamRows,
    },
    latitudeShares,
    hemisphereShares,
    dominantLatitudeBand: dominantKey(latitudeShares),
    dominantHemisphere: dominantKey(hemisphereShares),
    dominantNorthSouth: hemisphereShares.north >= hemisphereShares.south ? "north" : "south",
    dominantEastWest: hemisphereShares.east >= hemisphereShares.west ? "east" : "west",
    // Keep raw-pixel summary fields above stable, but expose the components
    // used for physical measurements in spherical (cosine-weighted) area order.
    largestComponents: [...components]
      .sort((a, b) => b.weightedArea - a.weightedArea || b.pixelCount - a.pixelCount)
      .slice(0, 12).map((component) => ({
      ...component,
      shareOfLand: landPixels ? component.pixelCount / landPixels : 0,
      sphericalShare: weightedLandArea ? component.weightedArea / weightedLandArea : 0,
    })),
    anomalyFlags,
    anomaly: anomalyFlags.includes("global-land")
      ? "Global-land anomaly: more than 80% of the map is classified as land."
      : anomalyFlags.includes("near-empty") ? "Near-empty mask anomaly: almost no land was detected." : null,
  };
  data.contextProfile = maskProfile(data);
  data.evidenceSummary = maskEvidence(data);
  return data;
}


export function compareMasks(a, b, width, height, thresholdA = 0, thresholdB = 0) {
  let intersection = 0, union = 0, aLand = 0, bLand = 0, aOnly = 0, bOnly = 0;
  let weightedIntersection = 0, weightedUnion = 0, weightedAgreement = 0, weightedTotal = 0;
  for (let index = 0; index < a.length; index += 1) {
    const inA = a[index] > thresholdA; const inB = b[index] > thresholdB;
    const y = Math.floor(index / width); const weight = rowWeight(y, height); weightedTotal += weight;
    aLand += inA ? 1 : 0; bLand += inB ? 1 : 0;
    if (inA && inB) { intersection += 1; weightedIntersection += weight; }
    if (inA || inB) { union += 1; weightedUnion += weight; }
    if (inA && !inB) aOnly += 1; if (inB && !inA) bOnly += 1;
    if (inA === inB) weightedAgreement += weight;
  }
  return {
    intersectionPixels: intersection, unionPixels: union, layerAOnlyPixels: aOnly, layerBOnlyPixels: bOnly,
    intersectionOverUnion: union ? intersection / union : 1,
    diceCoefficient: aLand + bLand ? (2 * intersection) / (aLand + bLand) : 1,
    pixelAgreement: a.length ? (a.length - aOnly - bOnly) / a.length : 1,
    sphericalAgreement: weightedTotal ? weightedAgreement / weightedTotal : 1,
    sphericalIntersectionOverUnion: weightedUnion ? weightedIntersection / weightedUnion : 1,
    layerAPrecisionAgainstB: aLand ? intersection / aLand : 1,
    layerBRecallAgainstA: bLand ? intersection / bLand : 1,
  };
}
