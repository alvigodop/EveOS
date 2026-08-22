import { analyzeMask, compareMasks } from "./mask-intelligence.js";
import { analyzeHeightmap, analyzeVisual, compareHeightmaps, compareVisuals } from "./raster-intelligence.js";
import {
  assimilateHeightEvidence, buildFeaturePreservingMask, buildProvisionalEnvironmentalZones,
  clipHeightmapToMask, extractClimatePalette,
} from "./evidence-assimilation-core.js";

function maskFromGray(gray, threshold) {
  const mask = new Uint8Array(gray.length);
  for (let index = 0; index < gray.length; index += 1) {
    mask[index] = gray[index] > threshold ? 1 : 0;
  }
  return mask;
}

function mergeMasks(a, b, operation, thresholdA, thresholdB) {
  const maskA = maskFromGray(a, thresholdA);
  const maskB = maskFromGray(b, thresholdB);
  const output = new Uint8Array(a.length);
  for (let index = 0; index < output.length; index += 1) {
    if (operation === "intersection") output[index] = maskA[index] && maskB[index] ? 255 : 0;
    else if (operation === "prefer-b") output[index] = maskB[index] ? 255 : 0;
    else if (operation === "prefer-a") output[index] = maskA[index] ? 255 : 0;
    else output[index] = maskA[index] || maskB[index] ? 255 : 0;
  }
  return output;
}

function differenceMasks(a, b, thresholdA, thresholdB) {
  const maskA = maskFromGray(a, thresholdA);
  const maskB = maskFromGray(b, thresholdB);
  const rgba = new Uint8ClampedArray(a.length * 4);
  for (let index = 0; index < a.length; index += 1) {
    const offset = index * 4;
    if (maskA[index] && maskB[index]) {
      rgba[offset] = 78; rgba[offset + 1] = 220; rgba[offset + 2] = 145;
    } else if (maskA[index]) {
      rgba[offset] = 255; rgba[offset + 1] = 177; rgba[offset + 2] = 66;
    } else if (maskB[index]) {
      rgba[offset] = 75; rgba[offset + 1] = 190; rgba[offset + 2] = 255;
    } else {
      rgba[offset] = 3; rgba[offset + 1] = 8; rgba[offset + 2] = 18;
    }
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function confidenceMap(a, b, thresholdA, thresholdB) {
  const maskA = maskFromGray(a, thresholdA);
  const maskB = maskFromGray(b, thresholdB);
  const output = new Uint8Array(a.length);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = maskA[index] && maskB[index] ? 192
      : maskA[index] || maskB[index] ? 96 : 0;
  }
  return output;
}

function consensusMasks(sources, votes, thresholds) {
  const output = new Uint8Array(sources[0].length);
  for (let index = 0; index < output.length; index += 1) {
    let count = 0;
    for (let source = 0; source < sources.length; source += 1) {
      if (sources[source][index] > thresholds[source]) count += 1;
    }
    output[index] = count >= votes ? 255 : 0;
  }
  return output;
}

function removeSmallComponents(gray, width, height, threshold) {
  if (!threshold || threshold <= 1) return gray;
  const output = new Uint8Array(gray);
  const visited = new Uint8Array(gray.length);
  const queue = new Int32Array(gray.length);
  for (let start = 0; start < output.length; start += 1) {
    if (!output[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width; const y = Math.floor(index / width);
      const neighbors = [
        y * width + ((x - 1 + width) % width), y * width + ((x + 1) % width),
        y > 0 ? index - width : -1, y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && output[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    if (tail < threshold) for (let index = 0; index < tail; index += 1) output[queue[index]] = 0;
  }
  return output;
}

function smoothHeightmap(source, mask, width, height, passes) {
  let input = source;
  for (let pass = 0; pass < passes; pass += 1) {
    const output = new Uint8Array(input.length);
    for (let index = 0; index < input.length; index += 1) {
      if (mask && !mask[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      let sum = 0, count = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const yy = y + oy;
        if (yy < 0 || yy >= height) continue;
        for (let ox = -1; ox <= 1; ox += 1) {
          const xx = (x + ox + width) % width;
          const next = yy * width + xx;
          if (!mask || mask[next]) { sum += input[next]; count += 1; }
        }
      }
      output[index] = count ? Math.round(sum / count) : input[index];
    }
    input = output;
  }
  return input;
}

function blendHeightmaps(a, b, weightB, detailStrength, maskGray, maskThreshold, contrast, smoothing, width, height) {
  const mask = maskGray ? maskFromGray(maskGray, maskThreshold) : null;
  const detailBase = detailStrength > 0 ? smoothHeightmap(b, mask, width, height, 2) : null;
  let output = new Uint8Array(a.length);
  for (let index = 0; index < output.length; index += 1) {
    if (mask && !mask[index]) continue;
    const recoveredDetail = detailBase ? (b[index] - detailBase[index]) * detailStrength : 0;
    let value = a[index] * (1 - weightB) + b[index] * weightB + recoveredDetail;
    value = 128 + (value - 128) * contrast;
    output[index] = Math.max(1, Math.min(255, Math.round(value)));
  }
  if (smoothing > 0) output = smoothHeightmap(output, mask, width, height, smoothing);
  if (mask) {
    for (let index = 0; index < output.length; index += 1) {
      if (!mask[index]) output[index] = 0;
      else if (!output[index]) output[index] = 1;
    }
  }
  return output;
}

function compositeVisual(a, b, maskGray, maskThreshold, landInfluence) {
  const mask = maskFromGray(maskGray, maskThreshold);
  const output = new Uint8ClampedArray(a.length);
  for (let index = 0; index < mask.length; index += 1) {
    const pixel = index * 4;
    const blend = mask[index] ? landInfluence : 0;
    for (let channel = 0; channel < 3; channel += 1) {
      output[pixel + channel] = Math.round(a[pixel + channel] * (1 - blend) + b[pixel + channel] * blend);
    }
    output[pixel + 3] = 255;
  }
  return output;
}

function medianHeightmaps(sources, maskGray, maskThreshold) {
  const mask = maskGray ? maskFromGray(maskGray, maskThreshold) : null;
  const output = new Uint8Array(sources[0].length);
  const values = new Array(sources.length);
  for (let index = 0; index < output.length; index += 1) {
    if (mask && !mask[index]) continue;
    for (let source = 0; source < sources.length; source += 1) values[source] = sources[source][index];
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    const value = values.length % 2 ? values[middle]
      : Math.round((values[middle - 1] + values[middle]) / 2);
    output[index] = mask ? Math.max(1, value) : value;
  }
  return output;
}

self.onmessage = (event) => {
  const { id, operation, payload } = event.data;
  try {
    let result;
    if (operation === "analyze-mask") {
      result = analyzeMask(payload.gray, payload.width, payload.height, payload.threshold, payload.tinyThreshold);
    } else if (operation === "analyze-heightmap") {
      result = analyzeHeightmap(payload.gray, payload.width, payload.height);
    } else if (operation === "analyze-visual") {
      result = analyzeVisual(payload.rgba, payload.width, payload.height);
    } else if (operation === "compare-masks-stats") {
      result = compareMasks(payload.a, payload.b, payload.width, payload.height, payload.thresholdA, payload.thresholdB);
    } else if (operation === "compare-heightmaps-stats") {
      result = compareHeightmaps(payload.a, payload.b);
    } else if (operation === "compare-visuals-stats") {
      result = compareVisuals(payload.a, payload.b);
    } else if (operation === "merge-masks") {
      result = mergeMasks(payload.a, payload.b, payload.mode, payload.thresholdA, payload.thresholdB);
      result = removeSmallComponents(result, payload.width, payload.height, payload.tinyThreshold);
    } else if (operation === "difference-masks") {
      result = differenceMasks(payload.a, payload.b, payload.thresholdA, payload.thresholdB);
    } else if (operation === "confidence-map") {
      result = confidenceMap(payload.a, payload.b, payload.thresholdA, payload.thresholdB);
    } else if (operation === "consensus-masks") {
      result = consensusMasks(payload.sources, payload.votes, payload.thresholds);
      result = removeSmallComponents(result, payload.width, payload.height, payload.tinyThreshold);
    } else if (operation === "blend-heightmaps") {
      result = blendHeightmaps(
        payload.a, payload.b, payload.weightB, payload.detailStrength,
        payload.mask, payload.maskThreshold, payload.contrast, payload.smoothing,
        payload.width, payload.height,
      );
    } else if (operation === "median-heightmaps") {
      result = medianHeightmaps(payload.sources, payload.mask, payload.maskThreshold);
    } else if (operation === "composite-visual") {
      result = compositeVisual(payload.a, payload.b, payload.mask, payload.maskThreshold, payload.landInfluence);
    } else if (operation === "build-feature-mask") {
      result = buildFeaturePreservingMask(payload);
    } else if (operation === "assimilate-height-evidence") {
      result = assimilateHeightEvidence(payload);
    } else if (operation === "clip-heightmap-to-mask") {
      result = clipHeightmapToMask(payload);
    } else if (operation === "extract-climate-palette") {
      result = extractClimatePalette(payload);
    } else if (operation === "build-provisional-zones") {
      result = buildProvisionalEnvironmentalZones(payload);
    } else throw new Error(`Unknown refinement operation: ${operation}`);
    const transferable = result?.rgba || result?.gray || result;
    const transfer = transferable?.buffer ? [transferable.buffer] : [];
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
