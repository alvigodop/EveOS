import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMask } from "../assets/js/refinement/mask-intelligence.js";

test("largest component evidence is selected by spherical area before truncation", () => {
  const width = 80;
  const height = 40;
  const gray = new Uint8Array(width * height);
  // Twelve four-pixel components very near the pole lead by raw pixels but
  // carry little spherical area because equirectangular polar pixels are narrow.
  for (let component = 0; component < 12; component += 1) {
    const x = component * 3;
    for (const y of [0, 1]) {
      gray[y * width + x] = 255;
      gray[y * width + x + 1] = 255;
    }
  }
  // This three-pixel equatorial component ranks thirteenth by raw pixels but
  // must survive the top-twelve physical-area evidence selection.
  for (let x = 60; x < 63; x += 1) gray[20 * width + x] = 255;

  const analysis = analyzeMask(gray, width, height, 0, 1);
  assert.ok(analysis.weightedLandArea > 0, "total physical land weight is exported");
  assert.ok(analysis.totalWeightedArea > analysis.weightedLandArea);
  assert.equal(analysis.largestLandmass, 4, "raw largest-landmass summary stays unchanged");
  assert.equal(analysis.largestComponents.length, 12);
  assert.ok(
    analysis.largestComponents.some((component) => Math.abs(component.centroid.latitude) < 5),
    "the physically larger equatorial component must not be truncated",
  );
  assert.ok(
    analysis.largestComponents.every((component, index, list) => (
      index === 0 || list[index - 1].weightedArea >= component.weightedArea
    )),
    "component evidence is ordered by weighted physical area",
  );
});
