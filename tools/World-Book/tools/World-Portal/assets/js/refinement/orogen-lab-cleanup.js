import {
  ensureLayerAssets, getCanonicalLayer, removeLayer,
} from "../world/world-layer-store.js";
import { ensureMissionAssets, REFINEMENT_MISSION_STAGES } from "../mission/refinement-mission-store.js";

function protectedLayerIds(record) {
  const assets = ensureLayerAssets(record);
  return new Set([
    getCanonicalLayer(record, "visual")?.id,
    getCanonicalLayer(record, "mask")?.id,
    getCanonicalLayer(record, "heightmap")?.id,
    assets.heightmapForge?.normalizedVisualLayerId,
    assets.heightmapForge?.landMaskLayerId,
    assets.heightmapForge?.heightmapLayerId,
  ].filter(Boolean));
}

function isLabLayer(layer) {
  return !!(
    layer.sessionId
    || /Orogen|Refinement|Finalizer/i.test(layer.sourceTool || "")
    || ["analysis", "interpretation", "derived"].includes(layer.category)
  );
}

export function countClearableLabLayers(record) {
  const protectedIds = protectedLayerIds(record);
  return ensureLayerAssets(record).layers.filter((layer) => isLabLayer(layer) && !protectedIds.has(layer.id)).length;
}

export function clearOrogenLabImages(record) {
  const assets = ensureLayerAssets(record);
  const protectedIds = protectedLayerIds(record);
  const removable = assets.layers.filter((layer) => isLabLayer(layer) && !protectedIds.has(layer.id));
  for (const layer of removable) removeLayer(record, layer.id);
  assets.analysisSessions = [];
  assets.refinementPasses = assets.refinementPasses.filter((pass) => (
    pass.outputLayerIds?.some((id) => protectedIds.has(id))
  ));
  const missionAssets = ensureMissionAssets(record);
  for (const mission of missionAssets.refinementMissions) {
    mission.importedSessionIds = [];
    mission.latestComparison = null;
    mission.latestContext = null;
    mission.latestPlan = null;
    mission.latestExecution = null;
    mission.stage = mission.baseline?.maskLayerId && mission.baseline?.heightmapLayerId
      ? REFINEMENT_MISSION_STAGES.BASELINE_READY
      : REFINEMENT_MISSION_STAGES.BASELINE_REQUIRED;
    for (const pass of mission.passes || []) {
      pass.importedSessionIds = [];
      pass.comparison = null;
      if (pass.status !== "accepted") pass.status = "cleared";
    }
  }
  return { removedLayers: removable.length, preservedLayers: protectedIds.size };
}
