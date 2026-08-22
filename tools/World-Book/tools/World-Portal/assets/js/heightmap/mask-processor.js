function neighborIndexes(index, width, height, output) {
  const x = index % width;
  const y = (index / width) | 0;
  output[0] = x === 0 ? index + width - 1 : index - 1;
  output[1] = x === width - 1 ? index - width + 1 : index + 1;
  output[2] = y > 0 ? index - width : -1;
  output[3] = y < height - 1 ? index + width : -1;
}

function floodCandidate(candidate, width, height, seeds) {
  const size = width * height;
  const ocean = new Uint8Array(size);
  const queue = new Int32Array(size);
  const neighbors = new Int32Array(4);
  let head = 0;
  let tail = 0;

  for (const seed of seeds) {
    if (seed < 0 || seed >= size || !candidate[seed] || ocean[seed]) continue;
    ocean[seed] = 1;
    queue[tail++] = seed;
  }

  while (head < tail) {
    const index = queue[head++];
    neighborIndexes(index, width, height, neighbors);
    for (let side = 0; side < 4; side += 1) {
      const next = neighbors[side];
      if (next < 0 || ocean[next] || !candidate[next]) continue;
      ocean[next] = 1;
      queue[tail++] = next;
    }
  }
  return ocean;
}

function oceanSeeds(candidate, width, height, settings) {
  const seeds = [];
  const sampleX = Math.max(0, Math.min(width - 1, settings.sampleX | 0));
  const sampleY = Math.max(0, Math.min(height - 1, settings.sampleY | 0));
  const sampleIndex = sampleY * width + sampleX;
  if (candidate[sampleIndex]) seeds.push(sampleIndex);

  if (settings.edgeSeeds !== false) {
    for (let x = 0; x < width; x += 1) {
      if (candidate[x]) seeds.push(x);
      const bottom = (height - 1) * width + x;
      if (candidate[bottom]) seeds.push(bottom);
    }
    for (let y = 1; y < height - 1; y += 1) {
      const left = y * width;
      const right = left + width - 1;
      if (candidate[left]) seeds.push(left);
      if (candidate[right]) seeds.push(right);
    }
  }
  return seeds;
}

export function buildLandMask(rgba, width, height, settings = {}) {
  const size = width * height;
  const candidate = new Uint8Array(size);
  const [red, green, blue] = settings.oceanColor || [0, 80, 130];
  const tolerance = Math.max(0, Number(settings.tolerance) || 0);
  const toleranceSquared = tolerance * tolerance;

  for (let index = 0; index < size; index += 1) {
    const offset = index * 4;
    const dr = rgba[offset] - red;
    const dg = rgba[offset + 1] - green;
    const db = rgba[offset + 2] - blue;
    candidate[index] = dr * dr + dg * dg + db * db <= toleranceSquared ? 1 : 0;
  }

  const ocean = settings.connectedOnly === false
    ? candidate
    : floodCandidate(candidate, width, height, oceanSeeds(candidate, width, height, settings));
  const land = new Uint8Array(size);
  const invert = !!settings.invertMask;
  for (let index = 0; index < size; index += 1) {
    land[index] = invert ? ocean[index] : 1 - ocean[index];
  }
  return land;
}

function scanComponents(mask, target, width, height, callback) {
  const size = width * height;
  const visited = new Uint8Array(size);
  const queue = new Int32Array(size);
  const neighbors = new Int32Array(4);

  for (let start = 0; start < size; start += 1) {
    if (visited[start] || mask[start] !== target) continue;
    let head = 0;
    let tail = 0;
    let touchesVerticalEdge = false;
    visited[start] = 1;
    queue[tail++] = start;

    while (head < tail) {
      const index = queue[head++];
      const y = (index / width) | 0;
      if (y === 0 || y === height - 1) touchesVerticalEdge = true;
      neighborIndexes(index, width, height, neighbors);
      for (let side = 0; side < 4; side += 1) {
        const next = neighbors[side];
        if (next < 0 || visited[next] || mask[next] !== target) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    callback(queue, tail, start, touchesVerticalEdge);
  }
}

function removeSmallComponents(mask, width, height, minimumArea) {
  if (minimumArea <= 0) return;
  scanComponents(mask, 1, width, height, (queue, count) => {
    if (count >= minimumArea) return;
    for (let index = 0; index < count; index += 1) mask[queue[index]] = 0;
  });
}

function retainLargestComponent(mask, width, height) {
  let largestStart = -1;
  let largestCount = 0;
  scanComponents(mask, 1, width, height, (_queue, count, start) => {
    if (count > largestCount) {
      largestCount = count;
      largestStart = start;
    }
  });
  if (largestStart < 0) return;
  scanComponents(mask, 1, width, height, (queue, count, start) => {
    if (start === largestStart) return;
    for (let index = 0; index < count; index += 1) mask[queue[index]] = 0;
  });
}

function fillSmallHoles(mask, width, height, maximumArea) {
  if (maximumArea <= 0) return;
  scanComponents(mask, 0, width, height, (queue, count, _start, touchesVerticalEdge) => {
    if (touchesVerticalEdge || count > maximumArea) return;
    for (let index = 0; index < count; index += 1) mask[queue[index]] = 1;
  });
}

function smoothMask(mask, width, height, passes) {
  let current = mask;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let count = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = (x + ox + width) % width;
            count += current[ny * width + nx];
          }
        }
        next[y * width + x] = count >= 5 ? 1 : 0;
      }
    }
    current = next;
  }
  return current;
}

export function cleanLandMask(sourceMask, width, height, settings = {}) {
  let mask = new Uint8Array(sourceMask);
  removeSmallComponents(mask, width, height, Math.max(0, settings.minimumIslandArea | 0));
  if (settings.keepLargestLandmass) retainLargestComponent(mask, width, height);
  fillSmallHoles(mask, width, height, Math.max(0, settings.maximumHoleArea | 0));
  mask = smoothMask(mask, width, height, Math.max(0, Math.min(3, settings.smoothPasses | 0)));
  return mask;
}

export function analyzeLandMask(mask, width, height, tinyThreshold = 100) {
  let landPixels = 0;
  for (let index = 0; index < mask.length; index += 1) landPixels += mask[index];
  let landmassCount = 0;
  let tinyIslandCount = 0;
  scanComponents(mask, 1, width, height, (_queue, count) => {
    landmassCount += 1;
    if (count < tinyThreshold) tinyIslandCount += 1;
  });
  return {
    landPixels,
    landCoverage: landPixels / Math.max(mask.length, 1),
    landmassCount,
    tinyIslandCount,
  };
}
