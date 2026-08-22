import {
  getCanonicalLayer, ensureLayerAssets, layerDomain,
} from "../world/world-layer-store.js";
import {
  measureLandmasses, EARTH_RADIUS_KM, normalizePlanetRadiusKm,
} from "../refinement/landmass-metrics.js";
import { WORLD_PORTAL_STATE_EVENT, emitWorldStateChange } from "../world/world-events.js";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function layerTime(layer) {
  const stamp = Date.parse(layer?.updatedAt || layer?.createdAt || "");
  return Number.isFinite(stamp) ? stamp : Number(layer?.lastModified) || 0;
}

function newest(layers) {
  return [...layers].sort((a, b) => layerTime(b) - layerTime(a)
    || String(a.id || "").localeCompare(String(b.id || "")))[0] || null;
}

export function isOrogenReturnedMask(layer) {
  const source = String(layer?.sourceTool || "");
  const repository = String(layer?.sourceRepository || "");
  return layer?.type === "orogen-land-mask"
    || /^(world\s+)?orogen$/i.test(source.trim())
    || /planet_heightmap_generation|orogen\.studio/i.test(repository);
}

// Returned Orogen evidence is the integration result the user asked to inspect,
// so the newest returned mask leads. A user-selected canonical mask is the next
// choice, followed by the newest remaining mask.
export function selectMeasurableMask(record) {
  const canonical = getCanonicalLayer(record, "mask");
  const masks = ensureLayerAssets(record).layers
    .filter((layer) => layerDomain(layer.type) === "mask");
  const orogen = newest(masks.filter(isOrogenReturnedMask));
  const layer = orogen || canonical || newest(masks);
  if (!layer) return { layer: null, canonical: false, kind: "none" };
  return {
    layer,
    canonical: layer === canonical,
    kind: orogen ? "orogen-return" : layer === canonical ? "canonical" : "latest-mask",
  };
}

export function formatLayerProvenance(layer) {
  if (!layer) return "source unavailable";
  const tool = layer.sourceTool || "source tool not recorded";
  const version = layer.sourceVersion ? `version ${layer.sourceVersion}` : "version not recorded";
  const repository = layer.sourceRepository || "repository not recorded";
  return `${tool} · ${version} · ${repository}`;
}

export function hasPhysicalLandmassAnalysis(analysis) {
  const count = Number(analysis?.landmassCount || 0);
  const weightedArea = Number(analysis?.weightedLandArea);
  return Array.isArray(analysis?.largestComponents)
    && Number.isFinite(weightedArea)
    && weightedArea >= 0
    && (count === 0 || weightedArea > 0);
}

function metric(label, value) {
  const item = document.createElement("div");
  const name = document.createElement("span");
  const figure = document.createElement("strong");
  item.className = "landmass-metric";
  name.textContent = label;
  figure.textContent = value;
  item.append(name, figure);
  return item;
}

function sourceScope(source) {
  if (source.kind === "orogen-return") {
    return source.canonical ? "canonical Orogen-returned mask" : "newest Orogen-returned mask";
  }
  return source.canonical ? "canonical mask" : "newest available mask";
}

export function createLandmassPanel({ portal, orogenLab, state, autosave }) {
  const radiusInput = document.getElementById("planetRadiusKm");
  const measureButton = document.getElementById("measureLandmasses");
  const summary = document.getElementById("landmassSummary");
  const list = document.getElementById("landmassList");
  const note = document.getElementById("landmassNote");
  if (!summary || !list || !note) return null;

  let operationToken = 0;
  let busy = false;
  let lastMeasured = null;

  function radius() {
    return normalizePlanetRadiusKm(radiusInput?.value, EARTH_RADIUS_KM);
  }

  function setBusy(next) {
    busy = Boolean(next);
    if (measureButton) measureButton.disabled = busy;
    summary.setAttribute("aria-busy", String(busy));
  }

  function clear(message) {
    lastMeasured = null;
    summary.replaceChildren();
    list.replaceChildren();
    list.hidden = true;
    note.textContent = message;
  }

  function extentText(landmass) {
    const northSouth = `${integer.format(landmass.northSouthKm)} km N–S extent`;
    if (landmass.eastWestKm === null) {
      return `${northSouth} · E–W extent unavailable (crosses the raster seam)`;
    }
    const eastWest = `${integer.format(landmass.eastWestKm)} km E–W extent`;
    return landmass.seamWrapped
      ? `${northSouth} · ${eastWest} (seam-aware circular span)`
      : `${northSouth} · ${eastWest}`;
  }

  function render(measurement, source) {
    summary.replaceChildren();
    list.replaceChildren();
    if (!measurement?.available) {
      clear(measurement?.reason || "No land mask measured yet.");
      return;
    }
    summary.append(
      metric("Landmasses", String(measurement.landmassCount)),
      metric("Significant", String(measurement.significantLandmassCount)),
      metric("Tiny islands", String(measurement.tinyIslandCount)),
      metric("Land area", `${integer.format(measurement.totalLandAreaKm2)} km²`),
      metric("Land coverage", `${percent.format(measurement.landCoverage * 100)}%`),
      metric("Resolution", `${integer.format(measurement.resolutionKmPerPixel)} km/px`),
    );
    for (const landmass of measurement.landmasses) {
      const item = document.createElement("li");
      const area = document.createElement("strong");
      const share = document.createElement("span");
      const extents = document.createElement("span");
      item.className = landmass.tiny ? "landmass-item landmass-item--tiny" : "landmass-item";
      area.textContent = `${integer.format(landmass.areaKm2)} km² area`;
      share.textContent = `${percent.format(landmass.shareOfLand * 100)}% of physical land area`;
      extents.textContent = extentText(landmass);
      item.append(area, share, extents);
      if (landmass.centroid) {
        const at = document.createElement("span");
        at.className = "landmass-item__at";
        at.textContent = `Center ${landmass.centroid.latitude.toFixed(1)}°, ${landmass.centroid.longitude.toFixed(1)}°`;
        item.appendChild(at);
      }
      list.appendChild(item);
    }
    list.hidden = !measurement.landmasses.length;
    note.textContent = `${source.layer.name} · ${sourceScope(source)} · ${formatLayerProvenance(source.layer)}. `
      + `${measurement.note} Areas use spherical weighting; N–S and E–W figures are generalized extents, not a single coastline “length” or survey measurement.`;
  }

  function measurementFor(source) {
    return measureLandmasses(source.layer.analysis, {
      width: source.layer.width || source.layer.analysis?.width,
      height: source.layer.height || source.layer.analysis?.height,
      radiusKm: radius(),
    });
  }

  function renderStored(source = selectMeasurableMask(portal.getActiveRecord())) {
    if (!source.layer) {
      clear("This world has no land mask. Run Heightmap Forge or return a mask from Orogen.");
      return null;
    }
    if (!hasPhysicalLandmassAnalysis(source.layer.analysis)) {
      clear(`${source.layer.name} is ready to measure · ${sourceScope(source)} · ${formatLayerProvenance(source.layer)}.`);
      return null;
    }
    const measurement = measurementFor(source);
    lastMeasured = { measurement, source };
    render(measurement, source);
    return measurement;
  }

  function current(token, worldId, layerId) {
    if (token !== operationToken || portal.activeWorldId !== worldId) return false;
    return ensureLayerAssets(portal.getActiveRecord()).layers.some((layer) => layer.id === layerId);
  }

  async function measure() {
    if (busy) return null;
    const source = selectMeasurableMask(portal.getActiveRecord());
    if (!source.layer) return renderStored(source);
    const worldId = portal.activeWorldId;
    const layerId = source.layer.id;
    const token = ++operationToken;
    let computed = false;
    setBusy(true);
    note.textContent = `Measuring ${source.layer.name}…`;
    try {
      let analysis = source.layer.analysis;
      if (!hasPhysicalLandmassAnalysis(analysis)) {
        analysis = await orogenLab.engine.analyze(source.layer);
        computed = true;
      }
      if (!current(token, worldId, layerId)) return null;
      if (computed) {
        source.layer.analysis = analysis;
        source.layer.updatedAt = new Date().toISOString();
      }
      const measurement = measurementFor(source);
      lastMeasured = { measurement, source };
      render(measurement, source);
      if (computed) {
        autosave?.schedule("Landmass analysis computed");
        emitWorldStateChange("worldAssets", worldId, {
          reason: "landmass-analysis", layerId,
        });
      }
      return measurement;
    } catch (error) {
      if (current(token, worldId, layerId)) {
        note.textContent = `Could not measure the land mask: ${error?.message || error}`;
      }
      return null;
    } finally {
      if (token === operationToken) setBusy(false);
    }
  }

  function syncFromState() {
    operationToken += 1;
    setBusy(false);
    const nextRadius = normalizePlanetRadiusKm(state?.planetRadiusKm, EARTH_RADIUS_KM);
    if (radiusInput) radiusInput.value = String(nextRadius);
    renderStored();
  }

  function onRadiusChange() {
    const nextRadius = radius();
    if (radiusInput) radiusInput.value = String(nextRadius);
    state.planetRadiusKm = nextRadius;
    emitWorldStateChange("planetRadiusKm", nextRadius);
    renderStored();
  }

  function onWorldEvent(event) {
    const key = event.detail?.key;
    if (key === "worldAssets" && event.detail?.reason !== "landmass-analysis") syncFromState();
    if (key === "activeWorldId") queueMicrotask(syncFromState);
  }

  measureButton?.addEventListener("click", measure);
  radiusInput?.addEventListener("change", onRadiusChange);
  window.addEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
  syncFromState();

  return {
    measure,
    syncFromState,
    getLast: () => lastMeasured,
    destroy() {
      operationToken += 1;
      measureButton?.removeEventListener("click", measure);
      radiusInput?.removeEventListener("change", onRadiusChange);
      window.removeEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
    },
  };
}
