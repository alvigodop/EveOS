import {
  attachLayerToSession, createLayerRecord, createRefinementPass, getLayer,
  layerDomain, upsertLayer,
} from "../world/world-layer-store.js";
import { checksumBlob } from "./image-layer-utils.js";

function requireLayer(record, id, domain = null) {
  const layer = getLayer(record, id);
  if (!layer?.blob) throw new Error(`Layer ${id || "(missing)"} is unavailable.`);
  if (domain && layerDomain(layer.type) !== domain) throw new Error(`Layer ${id} must be a ${domain} layer.`);
  return layer;
}

export function createOrogenCommandService({ portal, autosave, engine }) {
  const record = () => portal.getActiveRecord();

  async function saveResult(result, options = {}) {
    const blob = await engine.resultToBlob(result);
    const layer = upsertLayer(record(), createLayerRecord({
      blob,
      name: options.name || `${portal.getActiveWorld().name} ${options.operation || "refinement"}`,
      type: result.type,
      category: options.category || "interpretation",
      sourceTool: "World Portal Refinement Lab",
      sourceVersion: "0.19.1",
      sessionId: options.sessionId || null,
      parentLayerIds: options.parentLayerIds || [],
      width: result.width,
      height: result.height,
      status: "generated",
      checksum: await checksumBlob(blob),
      analysis: result.analysis || null,
      notes: options.notes || "Generated through an allow-listed Eve or Mission operation.",
      metadata: { generatedOutput: true, operation: options.operation || null, missionId: options.missionId || null, ...(options.metadata || {}) },
    }));
    if (options.sessionId) attachLayerToSession(record(), options.sessionId, layer.id, "output");
    await autosave.flush("Refinement command output saved");
    return layer;
  }

  async function mergeMasks(options = {}) {
    const a = requireLayer(record(), options.layerAId || options.sourceLayerId, "mask");
    const b = requireLayer(record(), options.layerBId || options.orogenLayerId, "mask");
    const mode = options.mode || "intersection";
    const result = await engine.mergeMasks(a, b, mode, Number(options.tinyThreshold ?? 100));
    const layer = await saveResult(result, {
      name: options.name || `${portal.getActiveWorld().name} ${mode} mask`,
      operation: `mask-${mode}`, parentLayerIds: [a.id, b.id],
      sessionId: options.sessionId, missionId: options.missionId,
    });
    return { generatedLayerId: layer.id, generatedMaskLayerId: layer.id, analysis: layer.analysis };
  }

  async function consensusMasks(options = {}) {
    const ids = options.layerIds || [];
    const source = ids.map((id) => requireLayer(record(), id, "mask"));
    const result = await engine.consensus(source, Number(options.votes || Math.ceil(source.length / 2)), Number(options.tinyThreshold ?? 100));
    const layer = await saveResult(result, {
      name: options.name || `${portal.getActiveWorld().name} consensus mask`,
      operation: "mask-consensus", parentLayerIds: source.map((item) => item.id),
      sessionId: options.sessionId, missionId: options.missionId,
    });
    return { generatedLayerId: layer.id, generatedMaskLayerId: layer.id, analysis: layer.analysis };
  }

  async function fuseHeightmaps(options = {}) {
    const source = requireLayer(record(), options.sourceHeightmapLayerId || options.sourceLayerId || options.layerAId, "heightmap");
    const orogenIds = options.orogenHeightmapLayerIds || options.orogenLayerIds || [options.orogenHeightmapLayerId || options.orogenLayerId || options.layerBId].filter(Boolean);
    const others = orogenIds.map((id) => requireLayer(record(), id, "heightmap"));
    if (!others.length) throw new Error("At least one Orogen heightmap is required.");
    const mask = options.canonicalMaskLayerId ? requireLayer(record(), options.canonicalMaskLayerId, "mask") : null;
    let result;
    if (options.medianPasses && others.length > 1) {
      const median = await engine.medianHeightmaps(others, mask);
      const medianLayer = await saveResult(median, {
        name: `${portal.getActiveWorld().name} temporary median evidence`,
        operation: "median-height-evidence", parentLayerIds: others.map((item) => item.id),
        sessionId: options.sessionId, missionId: options.missionId,
      });
      result = await engine.blendHeightmaps(source, medianLayer, {
        weightB: Number(options.orogenWeight ?? 0.6),
        detailStrength: Number(options.interiorDetailRecovery ?? 0.35),
        contrast: Number(options.contrast ?? 1), smoothing: Number(options.smoothing ?? 1), maskLayer: mask,
      });
    } else {
      result = await engine.blendHeightmaps(source, others[0], {
        weightB: Number(options.orogenWeight ?? 0.6),
        detailStrength: Number(options.interiorDetailRecovery ?? 0.35),
        contrast: Number(options.contrast ?? 1), smoothing: Number(options.smoothing ?? 1), maskLayer: mask,
      });
    }
    const parents = [source.id, ...others.map((item) => item.id), ...(mask ? [mask.id] : [])];
    const layer = await saveResult(result, {
      name: options.name || `${portal.getActiveWorld().name} fused heightmap`,
      operation: "heightmap-fusion", parentLayerIds: parents,
      sessionId: options.sessionId, missionId: options.missionId,
    });
    return { generatedLayerId: layer.id, generatedHeightmapLayerId: layer.id, analysis: layer.analysis };
  }

  async function synthesizeVisual(options = {}) {
    const visual = requireLayer(record(), options.sourceVisualLayerId || options.layerAId, "visual");
    const derived = requireLayer(record(), options.derivedVisualLayerId || options.layerBId, "visual");
    const mask = requireLayer(record(), options.canonicalMaskLayerId, "mask");
    const result = await engine.compositeVisual(visual, derived, mask, Number(options.landInfluence ?? 1));
    const layer = await saveResult(result, {
      name: options.name || `${portal.getActiveWorld().name} refined visual map`,
      operation: "visual-synthesis", parentLayerIds: [visual.id, derived.id, mask.id],
      sessionId: options.sessionId, missionId: options.missionId,
    });
    return { generatedLayerId: layer.id, generatedVisualLayerId: layer.id };
  }


  async function buildFeatureMask(options = {}) {
    const canonical = requireLayer(record(), options.canonicalMaskLayerId || options.sourceMaskLayerId, "mask");
    const ids = options.evidenceMaskLayerIds || options.layerIds || [];
    const weights = options.evidenceWeights || options.weights || [];
    const evidence = ids.map((id, index) => ({
      layer: requireLayer(record(), id, "mask"), weight: Number(weights[index] ?? 1),
    }));
    const result = await engine.buildFeatureMask(canonical, evidence, options.settings || options);
    const layer = await saveResult(result, {
      name: options.name || `${portal.getActiveWorld().name} ${options.settings?.style || options.style || "hybrid"} character mask`,
      operation: "evidence-feature-mask", parentLayerIds: [canonical.id, ...ids],
      sessionId: options.sessionId, missionId: options.missionId,
      metadata: { evidenceAssimilation: result.assimilation || null, finalizationStyle: options.settings?.style || options.style || "hybrid" },
    });
    return { generatedLayerId: layer.id, generatedMaskLayerId: layer.id, analysis: layer.analysis };
  }

  async function assimilateEvidenceHeightmaps(options = {}) {
    const source = requireLayer(record(), options.canonicalHeightmapLayerId || options.sourceHeightmapLayerId, "heightmap");
    const mask = requireLayer(record(), options.maskLayerId || options.canonicalMaskLayerId, "mask");
    const ids = options.evidenceHeightmapLayerIds || options.layerIds || [];
    const weights = options.evidenceWeights || options.weights || [];
    const evidence = ids.map((id, index) => ({
      layer: requireLayer(record(), id, "heightmap"), weight: Number(weights[index] ?? 1),
    }));
    const result = await engine.assimilateHeightEvidence(source, evidence, mask, options.settings || options);
    const layer = await saveResult(result, {
      name: options.name || `${portal.getActiveWorld().name} evidence-assimilated heightmap`,
      operation: "evidence-height-assimilation", parentLayerIds: [source.id, mask.id, ...ids],
      sessionId: options.sessionId, missionId: options.missionId,
      metadata: { evidenceAssimilation: result.assimilation || null, finalizationStyle: options.settings?.style || options.style || "hybrid" },
    });
    return { generatedLayerId: layer.id, generatedHeightmapLayerId: layer.id, analysis: layer.analysis };
  }

  async function clipHeightmapEvidence(options = {}) {
    const height = requireLayer(record(), options.heightmapLayerId || options.layerId, "heightmap");
    const mask = requireLayer(record(), options.maskLayerId || options.canonicalMaskLayerId, "mask");
    const result = await engine.clipHeightmapToMask(height, mask, options);
    const layer = await saveResult(result, {
      name: options.name || `${height.name} clipped to canonical land`,
      operation: "clip-height-evidence", parentLayerIds: [height.id, mask.id],
      sessionId: options.sessionId, missionId: options.missionId,
    });
    return { generatedLayerId: layer.id, generatedHeightmapLayerId: layer.id, analysis: layer.analysis };
  }

  async function extractClimateMetadata(options = {}) {
    const selected = requireLayer(record(), options.layerId);
    const mask = options.maskLayerId ? requireLayer(record(), options.maskLayerId, "mask") : null;
    selected.metadata = {
      ...(selected.metadata || {}),
      climateEvidence: await engine.extractClimateMetadata(selected, mask),
    };
    selected.updatedAt = new Date().toISOString();
    await autosave.flush("Climate evidence metadata extracted");
    return { layerId: selected.id, climateEvidence: selected.metadata.climateEvidence };
  }

  async function buildEnvironmentalZones(options = {}) {
    const selected = requireLayer(record(), options.layerId);
    const mask = options.maskLayerId ? requireLayer(record(), options.maskLayerId, "mask") : null;
    const result = await engine.buildEnvironmentalZones(selected, mask, options);
    const layer = await saveResult(result, {
      name: options.name || `${selected.name} provisional environmental zones`,
      operation: "environmental-zone-extraction",
      parentLayerIds: [selected.id, ...(mask ? [mask.id] : [])],
      sessionId: options.sessionId, missionId: options.missionId,
      metadata: { environmentalZones: result.metadata || result.analysis?.environmentalZones || null },
    });
    return { generatedLayerId: layer.id, generatedZoneLayerId: layer.id, analysis: layer.analysis };
  }

  async function buildEvidenceNextPass(options = {}) {
    const canonicalMask = requireLayer(record(), options.canonicalMaskLayerId, "mask");
    const canonicalHeight = requireLayer(record(), options.canonicalHeightmapLayerId, "heightmap");
    const maskResult = await buildFeatureMask({
      canonicalMaskLayerId: canonicalMask.id, evidenceMaskLayerIds: options.maskEvidenceLayerIds || [],
      evidenceWeights: options.maskEvidenceWeights || [], settings: options.settings || {},
      sessionId: options.sessionId, missionId: options.missionId,
    });
    const heightResult = await assimilateEvidenceHeightmaps({
      canonicalHeightmapLayerId: canonicalHeight.id, maskLayerId: maskResult.generatedMaskLayerId,
      evidenceHeightmapLayerIds: options.heightEvidenceLayerIds || [], evidenceWeights: options.heightEvidenceWeights || [],
      settings: options.settings || {}, sessionId: options.sessionId, missionId: options.missionId,
    });
    const pass = createRefinementPass(record(), {
      name: options.name || `${portal.getActiveWorld().name} evidence assimilation pass`,
      sessionId: options.sessionId || null, parentPassId: options.parentPassId || null,
      missionId: options.missionId || null, missionPassId: options.missionPassId || null,
      inputLayerIds: [canonicalMask.id, canonicalHeight.id, ...(options.maskEvidenceLayerIds || []), ...(options.heightEvidenceLayerIds || [])],
      outputLayerIds: [maskResult.generatedMaskLayerId, heightResult.generatedHeightmapLayerId],
      settings: { operation: "evidence-assimilation", ...(options.settings || {}) },
      validation: { mask: maskResult.analysis, heightmap: heightResult.analysis },
      notes: options.notes || "Canonical skeleton combined with weighted Orogen evidence; no canonical layer was replaced.",
      status: "provisional",
    });
    const maskLayer = getLayer(record(), maskResult.generatedMaskLayerId);
    const heightLayer = getLayer(record(), heightResult.generatedHeightmapLayerId);
    maskLayer.passId = pass.id; heightLayer.passId = pass.id;
    await autosave.flush("Evidence assimilation pass saved");
    return {
      generatedMaskLayerId: maskLayer.id, generatedHeightmapLayerId: heightLayer.id,
      generatedLayerIds: [maskLayer.id, heightLayer.id], refinementPassId: pass.id,
      maskAnalysis: maskLayer.analysis, heightmapAnalysis: heightLayer.analysis,
    };
  }

  async function createPass(options = {}) {
    const pass = createRefinementPass(record(), {
      name: options.name,
      sessionId: options.sessionId || null,
      parentPassId: options.parentPassId || null,
      missionId: options.missionId || null,
      missionPassId: options.missionPassId || null,
      inputLayerIds: options.inputLayerIds || [],
      outputLayerIds: options.outputLayerIds || [],
      settings: options.settings || {}, validation: options.validation || null,
      notes: options.notes || "Created through Eve Guided or Refinement Mission Mode.",
      status: options.status || "provisional",
    });
    await autosave.flush("Refinement pass created");
    return { refinementPassId: pass.id };
  }

  return {
    mergeMasks, consensusMasks, fuseHeightmaps, synthesizeVisual, createPass,
    buildFeatureMask, assimilateEvidenceHeightmaps, clipHeightmapEvidence,
    extractClimateMetadata, buildEnvironmentalZones, buildEvidenceNextPass,
  };
}
