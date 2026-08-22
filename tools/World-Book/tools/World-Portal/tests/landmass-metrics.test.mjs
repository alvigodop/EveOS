import test from "node:test";
import assert from "node:assert/strict";
import {
  EARTH_RADIUS_KM, MAX_PLANET_RADIUS_KM,
  kmPerDegreeLatitude, kmPerDegreeLongitude, normalizePlanetRadiusKm,
  measureComponent, measureLandmasses,
} from "../assets/js/refinement/landmass-metrics.js";

const near = (actual, expected, tolerance) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${actual} within ${tolerance} of ${expected}`,
);

// Sum of cos(latitude) over every pixel of an all-land equirectangular mask.
function fullSphereWeightedArea(width, height) {
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    const latitude = 90 - ((y + 0.5) / height) * 180;
    total += Math.cos((latitude * Math.PI) / 180) * width;
  }
  return total;
}

test("a degree of latitude is the same length everywhere", () => {
  near(kmPerDegreeLatitude(EARTH_RADIUS_KM), 111.19, 0.05);
});

test("a degree of longitude shortens with the cosine of latitude", () => {
  const equator = kmPerDegreeLongitude(EARTH_RADIUS_KM, 0);
  near(equator, kmPerDegreeLatitude(EARTH_RADIUS_KM), 1e-9);
  near(kmPerDegreeLongitude(EARTH_RADIUS_KM, 60), equator / 2, 0.01);
  near(kmPerDegreeLongitude(EARTH_RADIUS_KM, 90), 0, 1e-9);
});

// The load-bearing check: if the area formula is right, a fully land-covered
// mask must measure the surface area of the sphere.
test("an all-land mask measures the whole sphere", () => {
  for (const [width, height] of [[64, 32], [360, 180], [2048, 1024]]) {
    const analysis = {
      weightedLandArea: fullSphereWeightedArea(width, height),
      landmassCount: 1,
      largestComponents: [],
    };
    const measured = measureLandmasses(analysis, { width, height });
    const sphere = 4 * Math.PI * EARTH_RADIUS_KM ** 2;
    // Discretization error shrinks as the raster gets finer.
    near(measured.totalLandAreaKm2 / sphere, 1, 0.01);
    near(measured.planetAreaKm2, sphere, 1);
  }
});

test("land coverage is reported as a fraction of the planet", () => {
  const width = 360;
  const height = 180;
  const analysis = {
    weightedLandArea: fullSphereWeightedArea(width, height) * 0.25,
    landmassCount: 3,
    tinyIslandCount: 1,
    largestComponents: [],
  };
  const measured = measureLandmasses(analysis, { width, height });
  near(measured.landCoverage, 0.25, 0.005);
  assert.equal(measured.significantLandmassCount, 2);
});

test("every distance and area scales with the planet radius", () => {
  const component = {
    weightedArea: 100, pixelCount: 100,
    bbox: { minX: 10, minY: 80, maxX: 30, maxY: 100 },
  };
  const dims = { width: 360, height: 180 };
  const earth = measureComponent(component, { ...dims, radiusKm: EARTH_RADIUS_KM });
  const doubled = measureComponent(component, { ...dims, radiusKm: EARTH_RADIUS_KM * 2 });
  near(doubled.northSouthKm / earth.northSouthKm, 2, 1e-9);
  near(doubled.eastWestKm / earth.eastWestKm, 2, 1e-9);
  near(doubled.areaKm2 / earth.areaKm2, 4, 1e-9);
});

test("north-south extent counts rows in degrees of latitude", () => {
  // 18 rows of a 180-row raster is 18 degrees of latitude.
  const component = { weightedArea: 1, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 17 } };
  const measured = measureComponent(component, { width: 360, height: 180 });
  near(measured.northSouthKm, 18 * kmPerDegreeLatitude(EARTH_RADIUS_KM), 1e-6);
});

test("east-west extent uses the widest contained latitude", () => {
  const width = 360;
  const height = 180;
  const span = { minX: 100, maxX: 119 };
  // A box straddling the equator gets the full equatorial degree length.
  const straddling = measureComponent(
    { weightedArea: 1, bbox: { ...span, minY: 80, maxY: 100 } }, { width, height },
  );
  near(straddling.eastWestKm, 20 * kmPerDegreeLongitude(EARTH_RADIUS_KM, 0), 1e-6);
  // A polar box is much narrower for the same number of columns.
  const polar = measureComponent(
    { weightedArea: 1, bbox: { ...span, minY: 0, maxY: 10 } }, { width, height },
  );
  assert.ok(polar.eastWestKm < straddling.eastWestKm / 2,
    "a polar band must be far narrower than an equatorial one");
});

test("a seam-wrapped landmass reports no east-west extent", () => {
  const measured = measureComponent({
    weightedArea: 50, crossesAntimeridian: true,
    bbox: { minX: 0, minY: 40, maxX: 359, maxY: 60 },
  }, { width: 360, height: 180 });
  assert.equal(measured.seamWrapped, true);
  assert.equal(measured.eastWestKm, null, "a bounding box cannot describe a wrapped span");
  assert.equal(measured.eastWestExtentMethod, "unavailable-wrapped-bbox");
  assert.ok(measured.northSouthKm > 0, "north-south is still meaningful across the seam");
});

test("an upstream circular span makes a seam-crossing extent measurable", () => {
  const measured = measureComponent({
    weightedArea: 50, crossesAntimeridian: true, longitudeSpanDegrees: 20,
    bbox: { minX: 0, minY: 80, maxX: 359, maxY: 100 },
  }, { width: 360, height: 180 });
  assert.equal(measured.eastWestExtentMethod, "circular-span");
  near(measured.eastWestKm, 20 * kmPerDegreeLongitude(EARTH_RADIUS_KM, 0), 1e-6);
});

test("landmasses are measured in rank order and carry their share", () => {
  const analysis = {
    landmassCount: 2,
    tinyIslandCount: 0,
    weightedLandArea: 150,
    largestComponents: [
      { weightedArea: 100, pixelCount: 100, shareOfLand: 0.67, bbox: { minX: 0, minY: 80, maxX: 40, maxY: 100 } },
      { weightedArea: 50, pixelCount: 50, shareOfLand: 0.33, bbox: { minX: 200, minY: 20, maxX: 220, maxY: 40 }, tiny: true },
    ],
  };
  const measured = measureLandmasses(analysis, { width: 360, height: 180 });
  assert.equal(measured.landmasses.length, 2);
  assert.deepEqual(measured.landmasses.map((l) => l.rank), [1, 2]);
  assert.ok(measured.landmasses[0].areaKm2 > measured.landmasses[1].areaKm2);
  assert.equal(measured.landmasses[1].tiny, true);
  near(measured.landmasses[0].shareOfLand, 2 / 3, 1e-9);
});

test("physical area determines display order instead of raw pixel count", () => {
  const analysis = {
    landmassCount: 2,
    weightedLandArea: 30,
    largestComponents: [
      { weightedArea: 10, pixelCount: 1000, centroid: { longitude: 1 }, bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
      { weightedArea: 20, pixelCount: 100, centroid: { longitude: 2 }, bbox: { minX: 2, minY: 80, maxX: 3, maxY: 81 } },
    ],
  };
  const measured = measureLandmasses(analysis, { width: 360, height: 180 });
  assert.equal(measured.landmasses[0].centroid.longitude, 2);
  assert.ok(measured.landmasses[0].areaKm2 > measured.landmasses[1].areaKm2);
});

test("area share prefers spherical share then derives from weighted area", () => {
  const base = {
    weightedLandArea: 100, landmassCount: 1,
    largestComponents: [{
      weightedArea: 25, pixelCount: 90, shareOfLand: 0.9,
      bbox: { minX: 0, minY: 80, maxX: 1, maxY: 81 },
    }],
  };
  const derived = measureLandmasses(base, { width: 360, height: 180 });
  near(derived.landmasses[0].shareOfLand, 0.25, 1e-9);
  const explicit = measureLandmasses({
    ...base,
    largestComponents: [{ ...base.largestComponents[0], sphericalShare: 0.2 }],
  }, { width: 360, height: 180 });
  near(explicit.landmasses[0].shareOfLand, 0.2, 1e-9);
});

test("invalid and excessive radii normalize before every calculation", () => {
  assert.equal(normalizePlanetRadiusKm("not-a-radius"), EARTH_RADIUS_KM);
  assert.equal(normalizePlanetRadiusKm(MAX_PLANET_RADIUS_KM * 2), MAX_PLANET_RADIUS_KM);
  const analysis = {
    weightedLandArea: 10, landmassCount: 1,
    largestComponents: [{ weightedArea: 10, bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 } }],
  };
  const fallback = measureLandmasses(analysis, {
    width: 360, height: 180, radiusKm: Number.NaN,
  });
  assert.equal(fallback.radiusKm, EARTH_RADIUS_KM);
  assert.ok(Number.isFinite(fallback.totalLandAreaKm2));
  const capped = measureLandmasses(analysis, {
    width: 360, height: 180, radiusKm: MAX_PLANET_RADIUS_KM * 2,
  });
  assert.equal(capped.radiusKm, MAX_PLANET_RADIUS_KM);
  assert.ok(Number.isFinite(capped.totalLandAreaKm2));
});

test("missing dimensions are reported rather than guessed", () => {
  const measured = measureLandmasses({ landmassCount: 4 }, {});
  assert.equal(measured.available, false);
  assert.match(measured.reason, /dimensions/i);
  assert.deepEqual(measured.landmasses, []);
});

test("the limit caps how many landmasses are measured", () => {
  const largestComponents = Array.from({ length: 30 }, (_, index) => ({
    weightedArea: 30 - index, pixelCount: 30 - index,
    bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  }));
  const measured = measureLandmasses(
    { landmassCount: 30, weightedLandArea: 100, largestComponents },
    { width: 360, height: 180, limit: 5 },
  );
  assert.equal(measured.landmasses.length, 5);
  assert.equal(measured.landmassCount, 30, "the total count is not capped by the display limit");
});
