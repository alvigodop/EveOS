function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 0.000001), 0, 1);
  return t * t * (3 - 2 * t);
}

function integerHash(x, y, seed) {
  let value = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13) ^ (seed | 0), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function valueNoise(u, v, frequency, seed) {
  const x = u * frequency;
  const y = v * frequency * 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const period = Math.max(1, Math.round(frequency));
  const wrap = (value) => ((value % period) + period) % period;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = integerHash(wrap(x0), y0, seed);
  const n10 = integerHash(wrap(x0 + 1), y0, seed);
  const n01 = integerHash(wrap(x0), y0 + 1, seed);
  const n11 = integerHash(wrap(x0 + 1), y0 + 1, seed);
  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;
  return top + (bottom - top) * sy;
}

function distanceFromCoast(mask, width, height) {
  const size = width * height;
  const distances = new Uint16Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  let maxDistance = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const left = y * width + ((x - 1 + width) % width);
      const right = y * width + ((x + 1) % width);
      const top = y > 0 ? index - width : -1;
      const bottom = y < height - 1 ? index + width : -1;
      if (!mask[left] || !mask[right] || (top >= 0 && !mask[top]) || (bottom >= 0 && !mask[bottom])) {
        distances[index] = 1;
        queue[tail++] = index;
      }
    }
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index / width) | 0;
    const nextDistance = Math.min(65535, distances[index] + 1);
    const neighbors = [
      y * width + ((x - 1 + width) % width),
      y * width + ((x + 1) % width),
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || !mask[next] || distances[next]) continue;
      distances[next] = nextDistance;
      maxDistance = Math.max(maxDistance, nextDistance);
      queue[tail++] = next;
    }
  }

  if (tail && maxDistance === 0) maxDistance = 1;
  return { distances, maxDistance };
}

export function generateElevation(mask, width, height, settings = {}) {
  const { distances, maxDistance } = distanceFromCoast(mask, width, height);
  const output = new Uint8Array(mask.length);
  const coastHeight = clamp(Number(settings.coastHeight) || 16, 1, 80);
  const inlandStrength = clamp(Number(settings.inlandStrength) || 120, 0, 240);
  const falloff = clamp(Number(settings.falloffExponent) || 0.8, 0.2, 4);
  const roughness = clamp(Number(settings.roughness) || 24, 0, 100);
  const frequency = clamp(Number(settings.noiseScale) || 28, 2, 256);
  const seed = Number.isFinite(Number(settings.seed)) ? Number(settings.seed) | 0 : 1337;

  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(height - 1, 1);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) {
        output[index] = 0;
        continue;
      }
      const u = x / Math.max(width - 1, 1);
      const distance = distances[index] || 1;
      const normalized = maxDistance > 0 ? distance / maxDistance : 0;
      const base = coastHeight + inlandStrength * Math.pow(normalized, falloff);
      const broad = valueNoise(u, v, frequency * 0.35, seed + 17);
      const medium = valueNoise(u, v, frequency, seed + 131);
      const fine = valueNoise(u, v, frequency * 3.5, seed + 977);
      const noise = (broad * 0.50 + medium * 0.34 + fine * 0.16) - 0.5;
      const coastTaper = smoothstep(0.015, 0.22, normalized);
      const elevation = base + noise * roughness * coastTaper;
      output[index] = clamp(Math.round(elevation), 1, 255);
    }
  }
  return output;
}

export function analyzeHeightmap(heightmap, mask) {
  let maxElevation = 0;
  let minLandElevation = 255;
  let minOceanGrayscale = 255;
  let oceanPixelsAboveZero = 0;
  let landPixels = 0;

  for (let index = 0; index < heightmap.length; index += 1) {
    const value = heightmap[index];
    if (mask[index]) {
      landPixels += 1;
      maxElevation = Math.max(maxElevation, value);
      minLandElevation = Math.min(minLandElevation, value);
    } else {
      minOceanGrayscale = Math.min(minOceanGrayscale, value);
      if (value > 0) oceanPixelsAboveZero += 1;
    }
  }

  return {
    maxElevation,
    minLandElevation: landPixels ? minLandElevation : 0,
    minOceanGrayscale: minOceanGrayscale === 255 && landPixels === heightmap.length
      ? null : minOceanGrayscale,
    oceanPixelsAboveZero,
  };
}
