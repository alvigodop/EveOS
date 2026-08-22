import {
  ensureLayerAssets, getCanonicalLayer, getLayer, layerDomain,
} from "../world/world-layer-store.js";
import {
  activeMissionPass, getActiveRefinementMission,
} from "../mission/refinement-mission-store.js";
import { selectedMissionCandidate } from "../mission/mission-candidates.js";

function exactLayer(record, layerId, label) {
  const layer = layerId ? getLayer(record, layerId) : null;
  if (layerId && !layer) throw new Error(`${label} layer ${layerId} is unavailable.`);
  return layer;
}

function validatePair(mask, heightmap) {
  if (!mask?.blob || !heightmap?.blob) {
    throw new Error("A selected or canonical mask and heightmap are both required.");
  }
  if (layerDomain(mask.type) !== "mask") throw new Error(`Layer ${mask.id} is not a mask layer.`);
  if (layerDomain(heightmap.type) !== "heightmap") throw new Error(`Layer ${heightmap.id} is not a heightmap layer.`);
}

function passPair(record, pass) {
  if (!pass) return null;
  const accepted = (pass.acceptedLayerIds || []).map((id) => getLayer(record, id)).filter(Boolean);
  const mask = accepted.find((layer) => layerDomain(layer.type) === "mask")
    || getLayer(record, pass.export?.generatedOutputLayerIds?.maskLayerId)
    || getLayer(record, pass.export?.finalMaskLayerId);
  const heightmap = accepted.find((layer) => layerDomain(layer.type) === "heightmap")
    || getLayer(record, pass.export?.generatedOutputLayerIds?.heightmapLayerId)
    || getLayer(record, pass.export?.finalHeightmapLayerId);
  return mask && heightmap ? { mask, heightmap } : null;
}

function latestGeneratedConflict(record, domain) {
  const assets = ensureLayerAssets(record);
  const forge = assets.heightmapForge || {};
  const latestId = domain === "mask"
    ? forge.latestGeneratedMaskLayerId
    : forge.latestGeneratedHeightmapLayerId;
  const canonical = getCanonicalLayer(record, domain);
  const latest = getLayer(record, latestId);
  return latest && latest.id !== canonical?.id ? latest : null;
}

function layerStats(layer) {
  const analysis = layer?.analysis || {};
  return {
    layerId: layer?.id || null,
    name: layer?.name || null,
    width: layer?.width || null,
    height: layer?.height || null,
    landPixelCount: Number(analysis.landPixels || analysis.nonzeroPixels || 0),
    componentCount: Number(analysis.componentCount || analysis.landmassCount || 0),
  };
}

function sourceDescriptor(type, context, mask, heightmap) {
  return {
    type,
    missionId: context.mission?.id || null,
    missionPassId: context.pass?.id || null,
    candidateId: context.candidate?.id || null,
    candidateStyle: context.candidate?.style || null,
    mask: layerStats(mask),
    heightmap: layerStats(heightmap),
  };
}

export function resolveOrogenSource(record, options = {}) {
  const mission = getActiveRefinementMission(record);
  const candidate = selectedMissionCandidate(mission);
  const pass = activeMissionPass(mission);
  const passLayers = passPair(record, pass);
  const canonical = {
    mask: getCanonicalLayer(record, "mask"),
    heightmap: getCanonicalLayer(record, "heightmap"),
  };
  const context = { mission, candidate, pass };
  let sourceType = "canonical-fallback";
  let mask;
  let heightmap;

  if (options.maskLayerId || options.heightmapLayerId) {
    sourceType = "explicit-layer-ids";
    mask = exactLayer(record, options.maskLayerId, "Mask")
      || (candidate ? getLayer(record, candidate.maskLayerId) : null)
      || passLayers?.mask || canonical.mask;
    heightmap = exactLayer(record, options.heightmapLayerId, "Heightmap")
      || (candidate ? getLayer(record, candidate.heightmapLayerId) : null)
      || passLayers?.heightmap || canonical.heightmap;
  } else if (candidate) {
    sourceType = "mission-selected-candidate";
    mask = getLayer(record, candidate.maskLayerId);
    heightmap = getLayer(record, candidate.heightmapLayerId);
  } else if (passLayers) {
    sourceType = "mission-accepted-pass";
    ({ mask, heightmap } = passLayers);
  } else {
    const newerMask = latestGeneratedConflict(record, "mask");
    const newerHeightmap = latestGeneratedConflict(record, "heightmap");
    if (newerMask || newerHeightmap) {
      throw new Error("A newer generated mask or heightmap exists but has not been selected. Choose which layers to finalize before building the Orogen input.");
    }
    ({ mask, heightmap } = canonical);
  }
  validatePair(mask, heightmap);

  if (candidate && sourceType !== "explicit-layer-ids"
    && (mask.id !== candidate.maskLayerId || heightmap.id !== candidate.heightmapLayerId)) {
    throw new Error("The active mission has a selected candidate, but the exporter resolved different layers. Export was blocked to prevent a silent canonical fallback.");
  }

  const requested = sourceType === "explicit-layer-ids"
    ? sourceDescriptor(sourceType, context, mask, heightmap)
    : candidate
      ? sourceDescriptor("mission-selected-candidate", context, getLayer(record, candidate.maskLayerId), getLayer(record, candidate.heightmapLayerId))
      : sourceDescriptor(sourceType, context, mask, heightmap);
  const resolved = sourceDescriptor(sourceType, context, mask, heightmap);
  const requestedCoastFloor = Number(
    options.coastFloor
    ?? options.requestedCoastFloor
    ?? candidate?.settings?.coastFloor
    ?? pass?.export?.coastFloor
    ?? pass?.export?.finalizationSettings?.coastFloor
    ?? 8,
  );
  return {
    mask,
    heightmap,
    sourceType,
    mission,
    candidate,
    pass,
    requested,
    resolved,
    requestedCoastFloor: Number.isFinite(requestedCoastFloor) ? requestedCoastFloor : 8,
  };
}
