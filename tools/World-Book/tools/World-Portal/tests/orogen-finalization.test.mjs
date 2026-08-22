import test from "node:test";
import assert from "node:assert/strict";
import {
  finalizeOrogenPixels, validateOrogenPixels,
} from "../assets/js/orogen/orogen-finalization-core.js";

// Deterministic pseudo-random source so property checks stay reproducible.
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buffers(width, height, seed = 1) {
  const random = seeded(seed);
  const size = width * height;
  const mask = new Uint8Array(size);
  const heightmap = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    mask[index] = Math.floor(random() * 256);
    heightmap[index] = Math.floor(random() * 256);
  }
  return { mask, heightmap };
}

test("finalize rejects buffers that do not match the requested dimensions", () => {
  assert.throws(
    () => finalizeOrogenPixels(new Uint8Array(3), new Uint8Array(4), 2, 2),
    /Finalization buffers do not match/,
  );
});

test("finalize produces a strictly binary mask", () => {
  const { mask, heightmap } = buffers(8, 4);
  const result = finalizeOrogenPixels(mask, heightmap, 8, 4);
  for (const value of result.mask) assert.ok(value === 0 || value === 255);
});

test("finalize zeroes every ocean pixel and counts the removals", () => {
  const mask = new Uint8Array([0, 0, 255, 255]);
  const heightmap = new Uint8Array([40, 0, 90, 200]);
  const result = finalizeOrogenPixels(mask, heightmap, 2, 2);
  assert.equal(result.heightmap[0], 0);
  assert.equal(result.heightmap[1], 0);
  assert.equal(result.corrections.removedOutsideMask, 1);
  assert.equal(result.corrections.landPixels, 2);
});

test("finalize raises land below the coast floor and preserves land above it", () => {
  const mask = new Uint8Array([255, 255, 255]);
  const heightmap = new Uint8Array([1, 8, 200]);
  const result = finalizeOrogenPixels(mask, heightmap, 3, 1, { coastFloor: 8 });
  assert.deepEqual([...result.heightmap], [8, 8, 200]);
  assert.equal(result.corrections.raisedToFloor, 1);
});

test("mask threshold is exclusive: a pixel equal to the threshold is ocean", () => {
  const mask = new Uint8Array([127, 128]);
  const heightmap = new Uint8Array([50, 50]);
  const result = finalizeOrogenPixels(mask, heightmap, 2, 1, { maskThreshold: 127 });
  assert.deepEqual([...result.mask], [0, 255]);
});

test("coast floor is clamped into 1..255", () => {
  const mask = new Uint8Array([255]);
  const heightmap = new Uint8Array([0]);
  assert.equal(finalizeOrogenPixels(mask, heightmap, 1, 1, { coastFloor: 0 }).settings.coastFloor, 1);
  assert.equal(finalizeOrogenPixels(mask, heightmap, 1, 1, { coastFloor: 9999 }).settings.coastFloor, 255);
});

test("requireMatchingLandSupport defaults on and is only disabled explicitly", () => {
  const mask = new Uint8Array([255]);
  const heightmap = new Uint8Array([10]);
  const on = finalizeOrogenPixels(mask, heightmap, 1, 1);
  const off = finalizeOrogenPixels(mask, heightmap, 1, 1, { requireMatchingLandSupport: false });
  assert.equal(on.settings.requireMatchingLandSupport, true);
  assert.equal(off.settings.requireMatchingLandSupport, false);
});

// The contract that matters: whatever goes in, finalize output must validate.
test("finalize output always passes validation, for any input", () => {
  for (const seed of [1, 7, 42, 1337, 90210]) {
    const width = 16;
    const height = 8;
    const { mask, heightmap } = buffers(width, height, seed);
    const result = finalizeOrogenPixels(mask, heightmap, width, height);
    const report = validateOrogenPixels(result.mask, result.heightmap, width, height, {
      requestedWidth: width, requestedHeight: height,
    });
    assert.ok(report.valid, `seed ${seed} produced errors: ${report.errors.join("; ")}`);
    assert.ok(report.supportAgreement);
    assert.equal(report.zeroHeightLandPixels, 0);
    assert.equal(report.oceanElevationPixels, 0);
    assert.equal(report.nonBinaryMaskPixels, 0);
  }
});

test("validation rejects non-2:1 dimensions", () => {
  const size = 4 * 4;
  const report = validateOrogenPixels(new Uint8Array(size), new Uint8Array(size), 4, 4);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => /2:1 equirectangular/.test(error)));
});

test("validation rejects a mask that is not strictly binary", () => {
  const mask = new Uint8Array([0, 128]);
  const heightmap = new Uint8Array([0, 0]);
  const report = validateOrogenPixels(mask, heightmap, 2, 1);
  assert.equal(report.nonBinaryMaskPixels, 1);
  assert.ok(report.errors.some((error) => /values other than 0 and 255/.test(error)));
});

test("validation rejects elevation outside the mask", () => {
  const mask = new Uint8Array([0, 255]);
  const heightmap = new Uint8Array([7, 20]);
  const report = validateOrogenPixels(mask, heightmap, 2, 1);
  assert.equal(report.oceanElevationPixels, 1);
  assert.equal(report.supportAgreement, false);
  assert.ok(report.errors.some((error) => /elevation outside the mask/.test(error)));
});

test("validation rejects zero-height land", () => {
  const mask = new Uint8Array([255, 255]);
  const heightmap = new Uint8Array([0, 20]);
  const report = validateOrogenPixels(mask, heightmap, 2, 1);
  assert.equal(report.zeroHeightLandPixels, 1);
  assert.ok(report.errors.some((error) => /zero-height pixels/.test(error)));
});

test("support mismatch is reported strictly and can be waived", () => {
  // Pixel 0 is mask land with no height; pixel 1 is ocean carrying elevation.
  const mask = new Uint8Array([255, 0]);
  const heightmap = new Uint8Array([0, 9]);
  const strict = validateOrogenPixels(mask, heightmap, 2, 1);
  const waived = validateOrogenPixels(mask, heightmap, 2, 1, { requireMatchingLandSupport: false });
  assert.equal(strict.supportAgreement, false);
  assert.equal(strict.maskOnlyPixels, 1);
  assert.equal(strict.heightmapOnlyPixels, 1);
  assert.ok(strict.errors.some((error) => /land support do not match exactly/.test(error)));
  // Waiving drops only the support error; the other violations still stand.
  assert.ok(!waived.errors.some((error) => /land support do not match exactly/.test(error)));
  assert.equal(strict.errors.length - waived.errors.length, 1);
  assert.equal(waived.valid, false);
});

test("validation reports a requested-resolution mismatch", () => {
  const size = 2 * 1;
  const report = validateOrogenPixels(new Uint8Array(size), new Uint8Array(size), 2, 1, {
    requestedWidth: 4096, requestedHeight: 2048,
  });
  assert.ok(report.errors.some((error) => /do not match the requested resolution/.test(error)));
});

test("minimum land elevation reports 0 when there is no land at all", () => {
  const mask = new Uint8Array([0, 0]);
  const heightmap = new Uint8Array([0, 0]);
  const report = validateOrogenPixels(mask, heightmap, 2, 1);
  assert.equal(report.maskLandPixels, 0);
  assert.equal(report.minimumLandElevation, 0);
  assert.ok(report.valid);
});

test("land elevation range is reported across the accepted mask", () => {
  const mask = new Uint8Array([255, 255, 255, 0]);
  const heightmap = new Uint8Array([12, 200, 45, 0]);
  const report = validateOrogenPixels(mask, heightmap, 4, 2, { requestedWidth: 4, requestedHeight: 2 });
  assert.equal(report.minimumLandElevation, 12);
  assert.equal(report.maximumLandElevation, 200);
  assert.equal(report.maskLandPixels, 3);
});
