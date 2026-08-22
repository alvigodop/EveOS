// Converts raster mask analysis into real-world landmass measurements.
//
// The mask carries no scale of its own, so every figure here is a function of
// the planet radius recorded on the world. Change the radius and every distance
// and area scales with it. Earth's mean radius is the default.
//
// Pure and worker-safe: it consumes the component statistics that
// mask-intelligence already produces and adds no image processing.
export const EARTH_RADIUS_KM = 6371;
export const MAX_PLANET_RADIUS_KM = 1_000_000;

const DEG = Math.PI / 180;

export function normalizePlanetRadiusKm(value, fallback = EARTH_RADIUS_KM) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(numeric, MAX_PLANET_RADIUS_KM);
}

export function kmPerDegreeLatitude(radiusKm) {
  return (Math.PI * radiusKm) / 180;
}

export function kmPerDegreeLongitude(radiusKm, latitudeDegrees) {
  return kmPerDegreeLatitude(radiusKm) * Math.cos(latitudeDegrees * DEG);
}

function rowLatitudeFor(y, height) {
  return 90 - ((y + 0.5) / height) * 180;
}

// East-west degrees are longest nearest the equator, so the widest possible
// span for a bounding box sits on whichever contained row is closest to it.
function widestLatitudeInRange(minY, maxY, height) {
  const top = rowLatitudeFor(minY, height);
  const bottom = rowLatitudeFor(maxY, height);
  if (top >= 0 && bottom <= 0) return 0;
  return Math.abs(top) < Math.abs(bottom) ? top : bottom;
}

export function measureComponent(component, { width, height, radiusKm = EARTH_RADIUS_KM } = {}) {
  const bbox = component?.bbox;
  if (!bbox || !width || !height) return null;
  const safeRadiusKm = normalizePlanetRadiusKm(radiusKm);
  const latDegPerPx = 180 / height;
  const lonDegPerPx = 360 / width;
  const kmLat = kmPerDegreeLatitude(safeRadiusKm);

  const rows = bbox.maxY - bbox.minY + 1;
  const northSouthKm = rows * latDegPerPx * kmLat;

  // A component touching both raster edges wraps the seam. Prefer an explicit
  // circular span from an upstream analyzer when available; a normal bounding
  // box cannot truthfully describe that component's east-west extent.
  const seamWrapped = Boolean(component.crossesAntimeridian);
  const columns = bbox.maxX - bbox.minX + 1;
  const suppliedSpan = Number(
    component.longitudeSpanDegrees
      ?? component.longitudeExtent?.spanDegrees
      ?? component.geographicExtent?.longitude?.spanDegrees,
  );
  const hasSuppliedSpan = Number.isFinite(suppliedSpan) && suppliedSpan > 0 && suppliedSpan <= 360;
  const longitudeSpanDegrees = hasSuppliedSpan
    ? suppliedSpan : seamWrapped ? null : columns * lonDegPerPx;
  const widestLatitude = widestLatitudeInRange(bbox.minY, bbox.maxY, height);
  const eastWestKm = longitudeSpanDegrees === null
    ? null
    : longitudeSpanDegrees * kmPerDegreeLongitude(safeRadiusKm, widestLatitude);

  // weightedArea is the sum of cos(latitude) over the component's pixels. One
  // pixel covers latDegPerPx by lonDegPerPx degrees, and a degree of longitude
  // is a degree of latitude times cos(latitude) — which is exactly the weight
  // already summed. So the whole component reduces to one multiplication.
  const areaKm2 = Number(component.weightedArea || 0) * latDegPerPx * lonDegPerPx * kmLat * kmLat;

  return {
    areaKm2,
    northSouthKm,
    eastWestKm,
    seamWrapped,
    longitudeSpanDegrees,
    eastWestExtentMethod: seamWrapped
      ? hasSuppliedSpan ? "circular-span" : "unavailable-wrapped-bbox"
      : hasSuppliedSpan ? "supplied-span" : "bounding-box",
    pixelCount: component.pixelCount,
    compactness: component.compactness,
    centroid: component.centroid,
    tiny: Boolean(component.tiny),
  };
}

export function measureLandmasses(analysis, {
  width, height, radiusKm = EARTH_RADIUS_KM, limit = 12,
} = {}) {
  const components = Array.isArray(analysis?.largestComponents) ? analysis.largestComponents : [];
  const safeRadiusKm = normalizePlanetRadiusKm(radiusKm);
  const dims = {
    width: Number(width || analysis?.width) || 0,
    height: Number(height || analysis?.height) || 0,
    radiusKm: safeRadiusKm,
  };
  if (!dims.width || !dims.height) {
    return { available: false, reason: "Layer dimensions are unknown.", radiusKm: safeRadiusKm, landmasses: [] };
  }
  const weightedLandArea = Number(analysis?.weightedLandArea);
  const landmassCount = Number(analysis?.landmassCount || 0);
  if (!Number.isFinite(weightedLandArea) || weightedLandArea < 0
    || (landmassCount > 0 && weightedLandArea === 0)) {
    return {
      available: false,
      reason: "Physical land-area evidence is incomplete; re-analyze this mask.",
      radiusKm: safeRadiusKm,
      landmasses: [],
    };
  }

  const latDegPerPx = 180 / dims.height;
  const lonDegPerPx = 360 / dims.width;
  const kmLat = kmPerDegreeLatitude(safeRadiusKm);
  const pixelAreaFactor = latDegPerPx * lonDegPerPx * kmLat * kmLat;

  // Raw pixel counts overstate polar features in an equirectangular raster.
  // Rank the available components by cosine-weighted physical area instead.
  const ordered = components.map((component, sourceIndex) => ({ component, sourceIndex }))
    .sort((a, b) => Number(b.component.weightedArea || 0) - Number(a.component.weightedArea || 0)
      || Number(b.component.pixelCount || 0) - Number(a.component.pixelCount || 0)
      || a.sourceIndex - b.sourceIndex);
  const landmasses = ordered.slice(0, limit).map(({ component }, index) => {
    const measured = measureComponent(component, dims);
    return {
      rank: index + 1,
      areaKm2: measured.areaKm2,
      northSouthKm: measured.northSouthKm,
      eastWestKm: measured.eastWestKm,
      seamWrapped: measured.seamWrapped,
      eastWestExtentMethod: measured.eastWestExtentMethod,
      shareOfLand: Number.isFinite(Number(component.sphericalShare))
        ? Number(component.sphericalShare)
        : Number(analysis?.weightedLandArea) > 0
          ? Number(component.weightedArea || 0) / weightedLandArea
          : 0,
      centroid: component.centroid || null,
      tiny: Boolean(component.tiny),
    };
  });

  const totalLandAreaKm2 = weightedLandArea * pixelAreaFactor;
  const planetAreaKm2 = 4 * Math.PI * safeRadiusKm * safeRadiusKm;

  return {
    available: true,
    radiusKm: safeRadiusKm,
    width: dims.width,
    height: dims.height,
    landmassCount,
    tinyIslandCount: Number(analysis?.tinyIslandCount || 0),
    significantLandmassCount: Math.max(0, landmassCount - Number(analysis?.tinyIslandCount || 0)),
    totalLandAreaKm2,
    planetAreaKm2,
    landCoverage: planetAreaKm2 ? totalLandAreaKm2 / planetAreaKm2 : 0,
    landmasses,
    // Every figure is generalized at the mask's raster resolution and scales
    // with the recorded planet radius; neither is a survey measurement.
    resolutionKmPerPixel: latDegPerPx * kmLat,
    note: `Derived from a ${dims.width}x${dims.height} mask at a ${safeRadiusKm.toLocaleString()} km planet radius.`,
  };
}
