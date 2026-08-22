import {
  ensureLayerAssets, getCanonicalLayer, getLayer, layerDomain, markLayerCanonical,
} from "../world/world-layer-store.js";

function isBinaryMask(layer) {
  if (!layer || layerDomain(layer.type) !== "mask") return false;
  const analysis = layer.analysis || {};
  if (analysis.exactBlackShare !== undefined && analysis.exactWhiteShare !== undefined) {
    return Number(analysis.exactBlackShare) + Number(analysis.exactWhiteShare) > 0.995;
  }
  return !analysis.anomalyFlags?.some((flag) => /non.?binary|grayscale mask/i.test(String(flag)));
}

function anomalyCount(layer) {
  return Array.isArray(layer?.analysis?.anomalyFlags) ? layer.analysis.anomalyFlags.length : 0;
}

function latestValue(layer) {
  return Date.parse(layer?.updatedAt || layer?.createdAt || 0) || 0;
}

function bestLayer(record, domain) {
  const assets = ensureLayerAssets(record);
  const candidates = assets.layers.filter((layer) => layerDomain(layer.type) === domain);
  return [...candidates].sort((a, b) => {
    const sourceScore = (layer) => Number(layer.category === "source") * 5
      + Number(layer.isCanonical) * 3
      + Number(layer.status === "generated") * 2
      - anomalyCount(layer) * 4
      + Number(domain === "visual" && layer.type === "visual-map") * 4
      + Number(domain === "mask" && isBinaryMask(layer)) * 4;
    return sourceScore(b) - sourceScore(a) || latestValue(b) - latestValue(a);
  })[0] || null;
}

function dimensions(layer) {
  return layer?.width && layer?.height ? `${layer.width}x${layer.height}` : null;
}

export function inspectMissionPrerequisites(record, mission = null) {
  const canonical = {
    visual: getCanonicalLayer(record, "visual"),
    mask: getCanonicalLayer(record, "mask"),
    heightmap: getCanonicalLayer(record, "heightmap"),
  };
  const proposed = {
    visualLayerId: canonical.visual?.id || bestLayer(record, "visual")?.id || null,
    maskLayerId: canonical.mask?.id || bestLayer(record, "mask")?.id || null,
    heightmapLayerId: canonical.heightmap?.id || bestLayer(record, "heightmap")?.id || null,
  };
  const issues = [];
  if (!canonical.visual || layerDomain(canonical.visual.type) !== "visual") {
    issues.push({ code: "canonical-visual-invalid", message: "Canonical visual is missing or is not a visual layer.", proposedLayerId: proposed.visualLayerId });
  }
  if (canonical.visual && layerDomain(canonical.visual.type) === "visual" && canonical.visual.analysis?.grayscaleShare > 0.99 && canonical.visual.type !== "terrain") {
    issues.push({ code: "canonical-visual-masklike", message: "Canonical visual appears nearly binary or grayscale and may actually be a mask.", proposedLayerId: bestLayer(record, "visual")?.id || null });
  }
  if (!canonical.mask) issues.push({ code: "canonical-mask-missing", message: "Canonical mask is missing.", proposedLayerId: proposed.maskLayerId });
  else if (!isBinaryMask(canonical.mask)) issues.push({ code: "canonical-mask-not-binary", message: "Canonical mask is not confirmed as strict binary.", proposedLayerId: bestLayer(record, "mask")?.id || canonical.mask.id });
  if (!canonical.heightmap) issues.push({ code: "canonical-heightmap-missing", message: "Canonical heightmap is missing.", proposedLayerId: proposed.heightmapLayerId });
  if (canonical.heightmap?.analysis?.oceanNonZeroPixels > 0 || canonical.heightmap?.analysis?.heightmapOnlyPixels > 0) {
    issues.push({ code: "height-outside-land", message: "Canonical heightmap reports elevation outside accepted land.", proposedLayerId: bestLayer(record, "heightmap")?.id || canonical.heightmap.id });
  }
  const maskSize = dimensions(getLayer(record, proposed.maskLayerId));
  const heightSize = dimensions(getLayer(record, proposed.heightmapLayerId));
  if (maskSize && heightSize && maskSize !== heightSize) {
    issues.push({ code: "baseline-dimension-mismatch", message: `Mask ${maskSize} and heightmap ${heightSize} dimensions disagree.` });
  }
  if (mission) {
    const baselineIds = Object.values(mission.baseline || {}).filter(Boolean);
    const missing = baselineIds.filter((id) => !getLayer(record, id));
    if (missing.length) issues.push({ code: "mission-baseline-deleted", message: `Mission references ${missing.length} deleted baseline layer(s).` });
    if (!mission.baseline?.maskLayerId || !mission.baseline?.heightmapLayerId) {
      issues.push({ code: "mission-baseline-missing", message: "Mission has no complete mask and heightmap baseline." });
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    current: {
      visualLayerId: canonical.visual?.id || null,
      maskLayerId: canonical.mask?.id || null,
      heightmapLayerId: canonical.heightmap?.id || null,
    },
    proposed,
  };
}

export function applyMissionPrerequisiteRepair(record, mission, proposal) {
  const ids = proposal?.proposed || proposal || {};
  for (const [domain, key] of [["visual", "visualLayerId"], ["mask", "maskLayerId"], ["heightmap", "heightmapLayerId"]]) {
    const id = ids[key];
    if (!id) continue;
    const layer = getLayer(record, id);
    if (!layer || layerDomain(layer.type) !== domain) throw new Error(`Proposed ${domain} layer ${id} is unavailable or has the wrong role.`);
    markLayerCanonical(record, id);
  }
  if (mission) {
    mission.baseline = {
      visualLayerId: getCanonicalLayer(record, "visual")?.id || null,
      maskLayerId: getCanonicalLayer(record, "mask")?.id || null,
      heightmapLayerId: getCanonicalLayer(record, "heightmap")?.id || null,
    };
    mission.updatedAt = new Date().toISOString();
  }
  return inspectMissionPrerequisites(record, mission);
}
