import test from "node:test";
import assert from "node:assert/strict";
import {
  latitudeBand, percentileFromHistogram, pixelGeo, rowLatitude, rowWeight,
} from "../assets/js/refinement/analysis-math.js";

const close = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${actual} to be within ${tolerance} of ${expected}`,
);

test("row latitude samples pixel centres, not edges", () => {
  // With 180 rows each row is 1 degree; the first centre sits at 89.5.
  close(rowLatitude(0, 180), 89.5);
  close(rowLatitude(179, 180), -89.5);
  close(rowLatitude(90, 180), -0.5);
});

test("row latitude never reaches the poles exactly", () => {
  for (const height of [2, 16, 1024]) {
    assert.ok(rowLatitude(0, height) < 90);
    assert.ok(rowLatitude(height - 1, height) > -90);
  }
});

test("row weight peaks at the equator and shrinks toward the poles", () => {
  const height = 1024;
  const equator = rowWeight(height / 2, height);
  const middle = rowWeight(height / 4, height);
  const pole = rowWeight(0, height);
  assert.ok(equator > middle, "equator should outweigh mid-latitude");
  assert.ok(middle > pole, "mid-latitude should outweigh the pole");
  close(equator, Math.cos(rowLatitude(height / 2, height) * Math.PI / 180));
});

test("row weight stays strictly positive so area division is always safe", () => {
  for (const height of [2, 3, 180, 2048]) {
    for (const y of [0, 1, height - 2, height - 1]) {
      assert.ok(rowWeight(y, height) > 0, `height ${height} row ${y} produced a non-positive weight`);
    }
  }
});

test("pixel geo maps the raster corners into equirectangular degrees", () => {
  const { longitude, latitude } = pixelGeo(0, 0, 360, 180);
  close(longitude, -179.5);
  close(latitude, 89.5);
  close(pixelGeo(359, 179, 360, 180).longitude, 179.5);
  close(pixelGeo(359, 179, 360, 180).latitude, -89.5);
});

test("pixel geo longitude stays inside -180..180", () => {
  for (const x of [0, 1, 1023, 2047]) {
    const { longitude } = pixelGeo(x, 0, 2048, 1024);
    assert.ok(longitude > -180 && longitude < 180);
  }
});

test("percentile returns 0 for an empty population", () => {
  assert.equal(percentileFromHistogram(new Uint32Array(256), 0, 0.5), 0);
});

test("percentile finds the bucket holding the requested fraction", () => {
  const histogram = new Uint32Array(256);
  histogram[10] = 50;
  histogram[200] = 50;
  assert.equal(percentileFromHistogram(histogram, 100, 0.5), 10);
  assert.equal(percentileFromHistogram(histogram, 100, 0.51), 200);
  assert.equal(percentileFromHistogram(histogram, 100, 1), 200);
});

test("percentile honours the start offset so ocean zero can be excluded", () => {
  const histogram = new Uint32Array(256);
  histogram[0] = 900;
  histogram[40] = 100;
  assert.equal(percentileFromHistogram(histogram, 1000, 0.5), 0);
  assert.equal(percentileFromHistogram(histogram, 100, 0.5, 1), 40);
});

test("percentile clamps to the last bucket when the target is never reached", () => {
  const histogram = new Uint32Array(8);
  histogram[1] = 1;
  assert.equal(percentileFromHistogram(histogram, 1000, 0.9), 7);
});

test("latitude bands split on the tropic and polar circles", () => {
  assert.equal(latitudeBand(0), "tropical");
  assert.equal(latitudeBand(23.5), "tropical");
  assert.equal(latitudeBand(23.6), "midLatitude");
  assert.equal(latitudeBand(66.5), "midLatitude");
  assert.equal(latitudeBand(66.6), "polar");
  assert.equal(latitudeBand(90), "polar");
});

test("latitude bands are symmetric across the equator", () => {
  for (const latitude of [0, 12, 23.5, 40, 66.5, 80, 90]) {
    assert.equal(latitudeBand(latitude), latitudeBand(-latitude));
  }
});
