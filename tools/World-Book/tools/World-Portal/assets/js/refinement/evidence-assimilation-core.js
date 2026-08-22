const FAR = 65535;

function maskFromGray(gray, threshold = 127) {
  const mask = new Uint8Array(gray.length);
  for (let index = 0; index < gray.length; index += 1) mask[index] = gray[index] > threshold ? 1 : 0;
  return mask;
}

function coverage(mask) {
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) count += mask[index];
  return count / Math.max(1, mask.length);
}

function neighbors4(index, width, height, target) {
  const x = index % width;
  const y = Math.floor(index / width);
  target[0] = y * width + ((x - 1 + width) % width);
  target[1] = y * width + ((x + 1) % width);
  target[2] = y > 0 ? index - width : -1;
  target[3] = y + 1 < height ? index + width : -1;
  return target;
}

function coastlineDistance(mask, width, height, maximumDistance) {
  const distance = new Uint16Array(mask.length);
  distance.fill(FAR);
  const queue = new Int32Array(mask.length);
  const adjacent = new Int32Array(4);
  let head = 0, tail = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    distance[index] = 0;
    neighbors4(index, width, height, adjacent);
    if ((adjacent[0] >= 0 && !mask[adjacent[0]])
      || (adjacent[1] >= 0 && !mask[adjacent[1]])
      || (adjacent[2] >= 0 && !mask[adjacent[2]])
      || (adjacent[3] >= 0 && !mask[adjacent[3]])) queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++];
    const nextDistance = distance[index] + 1;
    if (nextDistance > maximumDistance) continue;
    neighbors4(index, width, height, adjacent);
    for (let slot = 0; slot < 4; slot += 1) {
      const next = adjacent[slot];
      if (next < 0 || distance[next] <= nextDistance) continue;
      distance[next] = nextDistance;
      queue[tail++] = next;
    }
  }
  return distance;
}

function removeSmallComponents(mask, width, height, minimumArea, preserveLargest = true) {
  if (!minimumArea || minimumArea <= 1) return mask;
  const output = new Uint8Array(mask);
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const adjacent = new Int32Array(4);
  const components = [];
  for (let start = 0; start < output.length; start += 1) {
    if (!output[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      neighbors4(index, width, height, adjacent);
      for (let slot = 0; slot < 4; slot += 1) {
        const next = adjacent[slot];
        if (next >= 0 && output[next] && !visited[next]) {
          visited[next] = 1; queue[tail++] = next;
        }
      }
    }
    components.push({ start, area: tail });
  }
  const largest = components.reduce((best, item) => item.area > (best?.area || 0) ? item : best, null);
  visited.fill(0);
  for (const component of components) {
    if (component.area >= minimumArea || (preserveLargest && component === largest)) continue;
    let head = 0, tail = 0;
    queue[tail++] = component.start; visited[component.start] = 1; output[component.start] = 0;
    while (head < tail) {
      const index = queue[head++];
      neighbors4(index, width, height, adjacent);
      for (let slot = 0; slot < 4; slot += 1) {
        const next = adjacent[slot];
        if (next >= 0 && mask[next] && !visited[next]) {
          visited[next] = 1; output[next] = 0; queue[tail++] = next;
        }
      }
    }
  }
  return output;
}

export function buildFeaturePreservingMask(payload) {
  const canonical = maskFromGray(payload.canonical, payload.canonicalThreshold ?? 127);
  const evidence = payload.evidence || [];
  const weights = payload.weights || evidence.map(() => 1);
  const style = payload.style || "hybrid";
  const expansion = style === "clean" ? 0 : Math.max(0, Math.round(payload.coastlineExpansion ?? 8));
  const islandDistance = style === "clean" ? 0 : Math.max(0, Math.round(payload.nearbyIslandDistance ?? 48));
  const minimumIslandArea = Math.max(1, Math.round(payload.minimumIslandArea ?? 20));
  const supportThreshold = Math.max(0, Math.min(1, Number(payload.evidenceSupport ?? 0.45)));
  const maximumEvidenceCoverage = Number(payload.maximumEvidenceCoverage ?? 0.35);
  const maximumDistance = Math.max(expansion, islandDistance);
  const distance = style === "clean" ? null
    : coastlineDistance(canonical, payload.width, payload.height, maximumDistance);
  const score = new Float32Array(canonical.length);
  let acceptedWeight = 0;
  const skippedEvidence = [];
  for (let source = 0; source < evidence.length; source += 1) {
    const sourceMask = maskFromGray(evidence[source], payload.thresholds?.[source] ?? 127);
    const sourceCoverage = coverage(sourceMask);
    const weight = Math.max(0, Number(weights[source] ?? 1));
    if (!weight || sourceCoverage > maximumEvidenceCoverage) {
      skippedEvidence.push({ index: source, coverage: sourceCoverage, reason: sourceCoverage > maximumEvidenceCoverage ? "global-land coverage" : "zero trust" });
      continue;
    }
    acceptedWeight += weight;
    for (let index = 0; index < score.length; index += 1) if (sourceMask[index]) score[index] += weight;
  }
  const output = new Uint8Array(canonical.length);
  for (let index = 0; index < output.length; index += 1) output[index] = canonical[index] ? 255 : 0;
  if (style === "clean" || !acceptedWeight) {
    const cleaned = removeSmallComponents(output, payload.width, payload.height, minimumIslandArea, true);
    return { gray: cleaned, stats: { style, addedPixels: 0, preservedIslandCount: 0, skippedEvidence, acceptedEvidenceCount: evidence.length - skippedEvidence.length } };
  }
  const candidate = new Uint8Array(output.length);
  for (let index = 0; index < candidate.length; index += 1) candidate[index] = score[index] / acceptedWeight >= supportThreshold ? 1 : 0;
  let addedPixels = 0;
  for (let index = 0; index < output.length; index += 1) {
    if (!output[index] && candidate[index] && distance[index] <= expansion) {
      output[index] = 255; addedPixels += 1;
    }
  }
  const visited = new Uint8Array(output.length);
  const queue = new Int32Array(output.length);
  const adjacent = new Int32Array(4);
  let preservedIslandCount = 0;
  let rejectedRemoteComponents = 0;
  for (let start = 0; start < output.length; start += 1) {
    if (!candidate[start] || output[start] || visited[start]) continue;
    let head = 0, tail = 0, minimumDistance = FAR;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      if (distance[index] < minimumDistance) minimumDistance = distance[index];
      neighbors4(index, payload.width, payload.height, adjacent);
      for (let slot = 0; slot < 4; slot += 1) {
        const next = adjacent[slot];
        if (next >= 0 && candidate[next] && !output[next] && !visited[next]) {
          visited[next] = 1; queue[tail++] = next;
        }
      }
    }
    if (tail >= minimumIslandArea && minimumDistance <= islandDistance) {
      preservedIslandCount += 1;
      for (let item = 0; item < tail; item += 1) {
        if (!output[queue[item]]) { output[queue[item]] = 255; addedPixels += 1; }
      }
    } else rejectedRemoteComponents += 1;
  }
  const cleaned = removeSmallComponents(output, payload.width, payload.height, Math.max(1, Number(payload.finalMinimumArea ?? 1)), true);
  return {
    gray: cleaned,
    stats: {
      style, addedPixels, preservedIslandCount, rejectedRemoteComponents,
      skippedEvidence, acceptedEvidenceCount: evidence.length - skippedEvidence.length,
      supportThreshold, coastlineExpansion: expansion, nearbyIslandDistance: islandDistance,
    },
  };
}

function percentileRange(gray, mask, lowPercent = 0.05, highPercent = 0.95) {
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let index = 0; index < gray.length; index += 1) {
    if (!mask[index]) continue;
    histogram[gray[index]] += 1; count += 1;
  }
  const quantile = (fraction) => {
    const target = Math.max(0, Math.ceil(count * fraction));
    let total = 0;
    for (let value = 0; value < 256; value += 1) {
      total += histogram[value];
      if (total >= target) return value;
    }
    return 255;
  };
  return { low: quantile(lowPercent), high: quantile(highPercent), count };
}

function blurMasked(source, mask, width, height, passes) {
  let input = source;
  for (let pass = 0; pass < passes; pass += 1) {
    const horizontal = new Float32Array(input.length);
    const horizontalCount = new Uint8Array(input.length);
    for (let index = 0; index < input.length; index += 1) {
      if (!mask[index]) continue;
      const x = index % width; const y = Math.floor(index / width);
      for (let offset = -1; offset <= 1; offset += 1) {
        const next = y * width + ((x + offset + width) % width);
        if (mask[next]) { horizontal[index] += input[next]; horizontalCount[index] += 1; }
      }
      horizontal[index] /= Math.max(1, horizontalCount[index]);
    }
    const output = new Float32Array(input.length);
    for (let index = 0; index < input.length; index += 1) {
      if (!mask[index]) continue;
      const y = Math.floor(index / width);
      let sum = 0, count = 0;
      for (let offset = -1; offset <= 1; offset += 1) {
        const yy = y + offset;
        if (yy < 0 || yy >= height) continue;
        const next = yy * width + (index % width);
        if (mask[next]) { sum += horizontal[next]; count += 1; }
      }
      output[index] = sum / Math.max(1, count);
    }
    input = output;
  }
  return input;
}

function normalizedValue(value, sourceRange, targetRange) {
  if (sourceRange.high <= sourceRange.low) return value;
  const scaled = targetRange.low + (value - sourceRange.low)
    * (targetRange.high - targetRange.low) / (sourceRange.high - sourceRange.low);
  return Math.max(1, Math.min(255, scaled));
}

export function assimilateHeightEvidence(payload) {
  const mask = maskFromGray(payload.mask, payload.maskThreshold ?? 127);
  const source = payload.source;
  const evidence = payload.evidence || [];
  const weights = payload.weights || evidence.map(() => 1);
  const sourceRange = percentileRange(source, mask);
  const aggregate = new Float32Array(source.length);
  let totalWeight = 0;
  const evidenceRanges = [];
  for (let sourceIndex = 0; sourceIndex < evidence.length; sourceIndex += 1) {
    const weight = Math.max(0, Number(weights[sourceIndex] ?? 1));
    if (!weight) continue;
    const range = percentileRange(evidence[sourceIndex], mask);
    evidenceRanges.push({ index: sourceIndex, weight, ...range });
    totalWeight += weight;
    for (let index = 0; index < aggregate.length; index += 1) {
      if (!mask[index]) continue;
      aggregate[index] += normalizedValue(evidence[sourceIndex][index], range, sourceRange) * weight;
    }
  }
  const coastFloor = Math.max(1, Math.min(255, Math.round(payload.coastFloor ?? 18)));
  if (!totalWeight) {
    const output = new Uint8Array(source.length);
    for (let index = 0; index < output.length; index += 1) output[index] = mask[index] ? Math.max(coastFloor, source[index]) : 0;
    return { gray: output, stats: { evidenceCount: 0, sourceRange, evidenceRanges } };
  }
  for (let index = 0; index < aggregate.length; index += 1) if (mask[index]) aggregate[index] /= totalWeight;
  const detailBlur = blurMasked(aggregate, mask, payload.width, payload.height, Math.max(1, Math.round(payload.detailRadius ?? 2)));
  const influence = Math.max(0, Math.min(1, Number(payload.evidenceInfluence ?? 0.58)));
  const detailStrength = Math.max(0, Number(payload.detailStrength ?? 0.75));
  const ridgeRetention = Math.max(0, Number(payload.ridgeRetention ?? 0.85));
  const valleyRetention = Math.max(0, Number(payload.valleyRetention ?? 0.65));
  const contrast = Math.max(0.25, Number(payload.contrast ?? 1.06));
  let mean = 0, landCount = 0;
  const working = new Float32Array(source.length);
  for (let index = 0; index < working.length; index += 1) {
    if (!mask[index]) continue;
    const detail = aggregate[index] - detailBlur[index];
    const detailScale = detail >= 0 ? ridgeRetention : valleyRetention;
    const sourceValue = Math.max(coastFloor, source[index]);
    working[index] = sourceValue * (1 - influence) + aggregate[index] * influence
      + detail * detailStrength * detailScale;
    mean += working[index]; landCount += 1;
  }
  mean /= Math.max(1, landCount);
  for (let index = 0; index < working.length; index += 1) {
    if (mask[index]) working[index] = mean + (working[index] - mean) * contrast;
  }
  const smoothing = Math.max(0, Math.min(4, Math.round(payload.smoothing ?? 1)));
  const smoothed = smoothing ? blurMasked(working, mask, payload.width, payload.height, smoothing) : working;
  const output = new Uint8Array(source.length);
  let maximum = 0, minimum = 255;
  for (let index = 0; index < output.length; index += 1) {
    if (!mask[index]) continue;
    const value = Math.max(coastFloor, Math.min(255, Math.round(smoothed[index])));
    output[index] = value; maximum = Math.max(maximum, value); minimum = Math.min(minimum, value);
  }
  return {
    gray: output,
    stats: {
      evidenceCount: evidenceRanges.length, sourceRange, evidenceRanges,
      minimum, maximum, coastFloor, evidenceInfluence: influence,
      detailStrength, ridgeRetention, valleyRetention, smoothing, contrast,
    },
  };
}

export function clipHeightmapToMask(payload) {
  const mask = maskFromGray(payload.mask, payload.maskThreshold ?? 127);
  const floor = Math.max(1, Math.min(255, Math.round(payload.coastFloor ?? 1)));
  const output = new Uint8Array(payload.heightmap.length);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = mask[index] ? Math.max(floor, payload.heightmap[index]) : 0;
  }
  return output;
}

function paletteKey(r, g, b) {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function paletteHex(key) {
  const r = ((key >> 8) & 15) * 17;
  const g = ((key >> 4) & 15) * 17;
  const b = (key & 15) * 17;
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function extractClimatePalette(payload) {
  const mask = payload.mask ? maskFromGray(payload.mask, payload.maskThreshold ?? 127) : null;
  const counts = new Uint32Array(4096);
  const bandCounts = Array.from({ length: 12 }, () => new Uint32Array(4096));
  let included = 0;
  for (let index = 0; index < payload.width * payload.height; index += 1) {
    if (mask && !mask[index]) continue;
    const pixel = index * 4;
    const key = paletteKey(payload.rgba[pixel], payload.rgba[pixel + 1], payload.rgba[pixel + 2]);
    counts[key] += 1;
    const y = Math.floor(index / payload.width);
    const band = Math.min(11, Math.floor(y / payload.height * 12));
    bandCounts[band][key] += 1;
    included += 1;
  }
  const ranked = [...counts.entries()].filter(([, count]) => count).sort((a, b) => b[1] - a[1]).slice(0, 16);
  const latitudeBands = bandCounts.map((band, index) => {
    const entries = [...band.entries()].filter(([, count]) => count).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, item) => sum + item[1], 0);
    const top = entries.slice(0, 5);
    const north = 90 - index * 15;
    return {
      north, south: north - 15, includedPixels: total,
      palette: top.map(([key, count]) => ({ color: paletteHex(key), count, share: count / Math.max(1, total) })),
    };
  });
  return {
    includedPixels: included,
    scope: mask ? "canonical-land-only" : "full-raster",
    palette: ranked.map(([key, count]) => ({ color: paletteHex(key), count, share: count / Math.max(1, included) })),
    latitudeBands,
    caution: "Palette clusters are measured color evidence, not named climate or biome classes without an Orogen legend.",
  };
}


function paletteRgb(key) {
  return [((key >> 8) & 15) * 17, ((key >> 4) & 15) * 17, (key & 15) * 17];
}

export function buildProvisionalEnvironmentalZones(payload) {
  const mask = payload.mask ? maskFromGray(payload.mask, payload.maskThreshold ?? 127) : null;
  const requested = Math.max(2, Math.min(24, Math.round(payload.zoneCount ?? 10)));
  const counts = new Uint32Array(4096);
  const pixelCount = payload.width * payload.height;
  for (let index = 0; index < pixelCount; index += 1) {
    if (mask && !mask[index]) continue;
    const pixel = index * 4;
    counts[paletteKey(payload.rgba[pixel], payload.rgba[pixel + 1], payload.rgba[pixel + 2])] += 1;
  }
  const palette = [...counts.entries()].filter(([, count]) => count)
    .sort((a, b) => b[1] - a[1]).slice(0, requested)
    .map(([key, count]) => ({ key, count, rgb: paletteRgb(key), color: paletteHex(key) }));
  if (!palette.length) throw new Error("The selected raster contains no pixels inside the analysis mask.");
  const zoneLookup = new Uint8Array(4096);
  for (let key = 0; key < zoneLookup.length; key += 1) {
    const [r, g, b] = paletteRgb(key);
    let best = 0, bestDistance = Number.POSITIVE_INFINITY;
    for (let zone = 0; zone < palette.length; zone += 1) {
      const [pr, pg, pb] = palette[zone].rgb;
      const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = zone; }
    }
    zoneLookup[key] = best;
  }
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const zoneCounts = new Uint32Array(palette.length);
  for (let index = 0; index < pixelCount; index += 1) {
    const pixel = index * 4;
    rgba[pixel + 3] = 255;
    if (mask && !mask[index]) continue;
    const key = paletteKey(payload.rgba[pixel], payload.rgba[pixel + 1], payload.rgba[pixel + 2]);
    const best = zoneLookup[key];
    const [zr, zg, zb] = palette[best].rgb;
    rgba[pixel] = zr; rgba[pixel + 1] = zg; rgba[pixel + 2] = zb;
    zoneCounts[best] += 1;
  }
  const includedPixels = zoneCounts.reduce((sum, count) => sum + count, 0);
  return {
    rgba,
    metadata: {
      includedPixels,
      zoneCount: palette.length,
      zones: palette.map((item, index) => ({
        index, color: item.color, pixelCount: zoneCounts[index],
        share: zoneCounts[index] / Math.max(1, includedPixels),
      })),
      scope: mask ? "canonical-land-only" : "full-raster",
      caution: "These are color-derived provisional environmental zones, not named biomes or climate classes without a supplied legend.",
    },
  };
}
