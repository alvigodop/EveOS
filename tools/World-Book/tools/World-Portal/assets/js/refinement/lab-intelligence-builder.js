import { ensureLayerAssets, getCanonicalLayer, layerDomain } from "../world/world-layer-store.js";
import { getActiveRefinementMission } from "../mission/refinement-mission-store.js";
import { evidenceProfile } from "./evidence-profile.js";
import { extractImageContainerMetadata } from "./image-container-metadata.js";
import { checksumBlob, readImageBlob, slugify } from "./image-layer-utils.js";
import { buildLayerReport, serializeLayer } from "../eve/layer-report.js";
import { buildEveBriefing } from "../eve/eve-briefing.js";
import { capabilityManifest } from "../eve/eve-capabilities.js";
import { refinementIntentManifest } from "./refinement-intent.js";
import { createStoredZip } from "../eve/zip-store.js";
import { appendAgentSkillEntries } from "../agent-skill/agent-skill-exporter.js";

const ANALYSIS_VERSION = "2.0.0";

function cacheState(layer) {
  const cache = layer.metadata?.analysisCache;
  if (cache?.state === "failed") return "failed";
  if (!layer.analysis) return "stale";
  if (layer.analysisVersion !== ANALYSIS_VERSION) return "stale";
  if (cache?.checksum && layer.checksum && cache.checksum !== layer.checksum) return "stale";
  return cache?.state || "cached";
}

export async function ensureIntelligence(layer, engine) {
  if (!layer?.blob) return layer;
  const state = cacheState(layer);
  if (state === "cached" || state === "fresh") return layer;
  layer.metadata = {
    ...(layer.metadata || {}),
    analysisCache: { checksum: layer.checksum || null, analysisVersion: ANALYSIS_VERSION, state: "pending" },
  };
  try {
    if (!layer.metadata.imageContainer) {
      layer.metadata.imageContainer = await extractImageContainerMetadata(layer.blob);
    }
    layer.analysis = await engine.analyze(layer);
    layer.analysis.file = {
      byteSize: layer.byteSize || layer.blob.size,
      mimeType: layer.mimeType || layer.blob.type,
      lastModified: layer.lastModified || null,
      checksum: layer.checksum || null,
      imageContainer: layer.metadata.imageContainer,
    };
    layer.analysisVersion = ANALYSIS_VERSION;
    layer.updatedAt = new Date().toISOString();
    layer.metadata.analysisCache = {
      checksum: layer.checksum || null,
      analysisVersion: ANALYSIS_VERSION,
      state: "fresh",
      analyzedAt: layer.updatedAt,
    };
  } catch (error) {
    layer.metadata.analysisCache = {
      checksum: layer.checksum || null,
      analysisVersion: ANALYSIS_VERSION,
      state: "failed",
      error: error?.message || String(error),
    };
    throw error;
  }
  return layer;
}

function candidateIndex(record) {
  const index = new Map();
  const missions = ensureLayerAssets(record).refinementMissions || [];
  for (const mission of missions) {
    for (const set of mission.candidateSets || []) {
      for (const candidate of set.candidates || []) {
        for (const id of [candidate.maskLayerId, candidate.heightmapLayerId]) {
          index.set(id, {
            missionId: mission.id,
            missionPassId: candidate.missionPassId || null,
            candidateSetId: set.id,
            candidateId: candidate.id,
            candidateStyle: candidate.style,
            candidateStatus: candidate.status,
            selected: mission.selectedCandidateId === candidate.id,
          });
        }
      }
    }
  }
  return index;
}

function keyStatistics(layer) {
  const data = layer.analysis || {};
  const domain = layerDomain(layer.type);
  if (domain === "mask") return {
    landCoverage: data.landCoverage ?? null,
    sphericalLandCoverage: data.sphericalLandCoverage ?? null,
    landPixelCount: Number(data.landPixels || data.nonzeroPixels || 0),
    componentCount: Number(data.componentCount || data.landmassCount || 0),
    coastlineComplexity: data.coastlineComplexity ?? null,
    tinyIslandCount: data.tinyIslandCount ?? null,
    orogenReady: data.orogenReady ?? null,
  };
  if (domain === "heightmap") return {
    landCoverage: data.landCoverage ?? null,
    nonzeroPixelCount: Number(data.nonzeroPixels || 0),
    minimumElevation: data.minimumLand ?? data.minimumLandElevation ?? null,
    maximumElevation: data.maximumElevation ?? data.maximumLandElevation ?? null,
    clippedPeakShare: data.clippedPeakShare ?? null,
    nearBlackLandShare: data.nearBlackLand?.share1to8 ?? null,
    terrainRoughness: data.terrainRoughness ?? null,
    orogenReady: data.orogenReady ?? null,
  };
  return {
    aspectRatio: data.aspectRatio ?? null,
    equirectangularStatus: data.equirectangularStatus ?? null,
    colorEntropy: data.colorEntropy ?? null,
    textureComplexity: data.textureComplexity ?? null,
    grayscaleShare: data.grayscaleShare ?? null,
  };
}

function layerEntry(layer, candidates) {
  const evidence = evidenceProfile(layer);
  return {
    ...serializeLayer(layer),
    domain: layerDomain(layer.type),
    evidence,
    cacheState: cacheState(layer),
    anomalyFlags: layer.analysis?.anomalyFlags || [],
    keyStatistics: keyStatistics(layer),
    candidate: candidates.get(layer.id) || null,
  };
}

function canonicalState(record) {
  return {
    visualLayerId: getCanonicalLayer(record, "visual")?.id || null,
    maskLayerId: getCanonicalLayer(record, "mask")?.id || null,
    heightmapLayerId: getCanonicalLayer(record, "heightmap")?.id || null,
  };
}

export async function buildComparisonMatrix(record, engine, layerIds, onProgress) {
  const assets = ensureLayerAssets(record);
  const chosen = layerIds.map((id) => assets.layers.find((layer) => layer.id === id)).filter(Boolean);
  if (chosen.length > 12) throw new Error("Choose at most 12 layers for one comparison matrix.");
  const pairs = [];
  let completed = 0;
  const total = Math.max(1, (chosen.length * (chosen.length - 1)) / 2);
  for (let a = 0; a < chosen.length; a += 1) {
    for (let b = a + 1; b < chosen.length; b += 1) {
      const layerA = chosen[a];
      const layerB = chosen[b];
      if (layerDomain(layerA.type) !== layerDomain(layerB.type)) continue;
      await Promise.all([ensureIntelligence(layerA, engine), ensureIntelligence(layerB, engine)]);
      const comparison = await engine.compareAnalysis(layerA, layerB);
      pairs.push({
        domain: layerDomain(layerA.type),
        layerAId: layerA.id,
        layerBId: layerB.id,
        layerAName: layerA.name,
        layerBName: layerB.name,
        comparison,
      });
      completed += 1;
      onProgress?.(completed / total, `Comparing ${layerA.name} with ${layerB.name}`);
    }
  }
  return pairs;
}

function candidateOverview(record) {
  const mission = getActiveRefinementMission(record);
  if (!mission) return [];
  const baseline = ensureLayerAssets(record).layers.find((layer) => layer.id === mission.baseline?.maskLayerId);
  const baselineLand = Number(baseline?.analysis?.landPixels || baseline?.analysis?.nonzeroPixels || 0);
  return (mission.candidateSets || []).flatMap((set) => (set.candidates || []).map((candidate) => {
    const mask = ensureLayerAssets(record).layers.find((layer) => layer.id === candidate.maskLayerId);
    const height = ensureLayerAssets(record).layers.find((layer) => layer.id === candidate.heightmapLayerId);
    const land = Number(mask?.analysis?.landPixels || mask?.analysis?.nonzeroPixels || candidate.summary?.landPixels || 0);
    return {
      id: candidate.id,
      style: candidate.style,
      label: candidate.label,
      maskLayerId: candidate.maskLayerId,
      heightmapLayerId: candidate.heightmapLayerId,
      landPixels: land,
      componentCount: Number(mask?.analysis?.componentCount || mask?.analysis?.landmassCount || candidate.summary?.componentCount || 0),
      addedLandVersusBaseline: Math.max(0, land - baselineLand),
      removedLandVersusBaseline: Math.max(0, baselineLand - land),
      preservedCompanionIslands: Number(candidate.summary?.preservedCompanionIslands || 0),
      rejectedRemoteComponents: Number(candidate.summary?.rejectedRemoteComponents || 0),
      coastlineComplexity: mask?.analysis?.coastlineComplexity ?? null,
      minimumElevation: height?.analysis?.minimumLand ?? height?.analysis?.minimumLandElevation ?? null,
      maximumElevation: height?.analysis?.maximumElevation ?? height?.analysis?.maximumLandElevation ?? null,
      supportAgreement: candidate.summary?.supportAgreement ?? null,
      orogenReady: candidate.summary?.orogenReady ?? null,
      selected: mission.selectedCandidateId === candidate.id,
      accepted: candidate.status === "accepted",
      exported: mission.lastExport?.selectedCandidateId === candidate.id,
      status: candidate.status,
    };
  }));
}

export async function buildLabIntelligence({ record, engine, layerIds = [], mode = "balanced", includeComparisons = false, onProgress } = {}) {
  const assets = ensureLayerAssets(record);
  const source = layerIds.length
    ? assets.layers.filter((layer) => layerIds.includes(layer.id))
    : assets.layers;
  for (let index = 0; index < source.length; index += 1) {
    const layer = source[index];
    if (layer.blob instanceof Blob) {
      onProgress?.(index / Math.max(1, source.length), `Analyzing ${layer.name}`);
      await ensureIntelligence(layer, engine);
    }
  }
  const candidates = candidateIndex(record);
  const comparisons = includeComparisons
    ? await buildComparisonMatrix(record, engine, source.map((layer) => layer.id), onProgress)
    : [];
  const snapshot = {
    format: "world-portal-lab-intelligence",
    version: 1,
    createdAt: new Date().toISOString(),
    mode,
    world: { id: record.id, name: record.name, schemaVersion: record.schemaVersion || null },
    canonical: canonicalState(record),
    counts: {
      layers: assets.layers.length,
      includedLayers: source.length,
      sessions: assets.analysisSessions.length,
      passes: assets.refinementPasses.length,
      candidates: candidateOverview(record).length,
    },
    layers: source.map((layer) => layerEntry(layer, candidates)),
    sessions: assets.analysisSessions,
    passes: assets.refinementPasses,
    missions: assets.refinementMissions || [],
    candidates: candidateOverview(record),
    comparisons,
    exportAudits: assets.orogen?.exportAudits || [],
    currentSettings: {
      evidence: assets.evidenceSettings || null,
      heightmapForge: assets.heightmapForge?.settings || null,
      orogenFinalizer: assets.orogen?.lastFinalization?.settings || null,
    },
  };
  const briefing = buildEveBriefing({
    record,
    comparisonSummary: comparisons,
    settings: snapshot.currentSettings,
    mode,
  });
  briefing.availableCapabilities = capabilityManifest();
  briefing.parameterRanges = refinementIntentManifest();
  snapshot.eveBriefing = briefing;
  onProgress?.(1, "Lab intelligence ready");
  return snapshot;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Preview encoding failed.")), "image/png",
  ));
}

async function previewBlob(layer, width) {
  const ratio = layer.width && layer.height ? layer.height / layer.width : 0.5;
  const outputWidth = Math.min(width, layer.width || width);
  const outputHeight = Math.max(1, Math.round(outputWidth * ratio));
  const image = await readImageBlob(layer.blob, outputWidth, outputHeight);
  return canvasBlob(image.canvas);
}

export async function createLabIntelligenceZip({ record, snapshot, mode = "balanced", includeFullResolution = false, onProgress } = {}) {
  const assets = ensureLayerAssets(record);
  const entries = [
    { name: "eve-briefing.json", data: JSON.stringify(snapshot.eveBriefing, null, 2) },
    { name: "lab-intelligence.json", data: JSON.stringify(snapshot, null, 2) },
    { name: "sessions.json", data: JSON.stringify(snapshot.sessions, null, 2) },
    { name: "passes.json", data: JSON.stringify(snapshot.passes, null, 2) },
    { name: "candidates.json", data: JSON.stringify(snapshot.candidates, null, 2) },
    { name: "comparison-matrix.json", data: JSON.stringify(snapshot.comparisons, null, 2) },
    { name: "export-audit.json", data: JSON.stringify(snapshot.exportAudits, null, 2) },
  ];
  const width = mode === "quick" ? 512 : mode === "forensic" ? 2048 : 1024;
  const includedIds = new Set(snapshot.layers.map((layer) => layer.id));
  const fileIndex = [];
  for (let index = 0; index < assets.layers.length; index += 1) {
    const layer = assets.layers[index];
    if (!includedIds.has(layer.id)) continue;
    const base = `${slugify(layer.name)}-${layer.id.slice(-6)}`;
    entries.push({ name: `layer-reports/${base}.json`, data: JSON.stringify(layerEntry(layer, candidateIndex(record)), null, 2) });
    entries.push({ name: `layer-reports/${base}.txt`, data: buildLayerReport(layer, { worldName: record.name }) });
    if (layer.blob instanceof Blob) {
      onProgress?.(index / Math.max(1, assets.layers.length), `Preparing ${layer.name}`);
      const previewPath = `previews/${base}.png`;
      entries.push({ name: previewPath, data: await previewBlob(layer, width) });
      let fullPath = null;
      const recommended = snapshot.eveBriefing.recommendedEvidence.some((item) => item.layerId === layer.id);
      let includedChecksum = null;
      if (includeFullResolution && (layer.isCanonical || recommended)) {
        const extension = layer.mimeType?.includes("jpeg") ? "jpg" : "png";
        fullPath = `assets/full/${base}.${extension}`;
        includedChecksum = await checksumBlob(layer.blob);
        entries.push({ name: fullPath, data: layer.blob });
      }
      fileIndex.push({
        path: fullPath || previewPath,
        previewPath,
        fullPath,
        role: layer.type,
        layerId: layer.id,
        filename: layer.filename,
        mimeType: layer.mimeType,
        width: layer.width,
        height: layer.height,
        checksum: layer.checksum,
        includedChecksum,
        checksumMatch: !fullPath || !layer.checksum || includedChecksum === layer.checksum,
        sessionId: layer.sessionId,
        passId: layer.passId,
        candidate: candidateIndex(record).get(layer.id) || null,
        parentLayerIds: layer.parentLayerIds || [],
        recommendedForAnalysis: recommended,
      });
    }
  }
  snapshot.eveBriefing.fileIndex = fileIndex;
  onProgress?.(0.97, "Adding portable Agent Skill");
  const skillPackage = await appendAgentSkillEntries(entries, { prefix: "agent-skill" });
  const names = new Set(entries.map((entry) => entry.name));
  const errors = fileIndex.flatMap((item) => [item.previewPath, item.fullPath]
    .filter(Boolean).filter((path) => !names.has(path)).map((path) => `Missing ZIP entry ${path}`));
  for (const required of ["agent-skill/SKILL.md", "agent-skill/skill-manifest.json", "agent-skill/capabilities.json", "agent-skill/parameter-ranges.json"]) {
    if (!names.has(required)) errors.push(`Missing Agent Skill entry ${required}`);
  }
  for (const item of fileIndex) {
    if (item.fullPath && item.checksum && item.checksumMatch === false) {
      errors.push(`Checksum mismatch for ${item.fullPath}`);
    }
  }
  const validation = { valid: errors.length === 0, errors, warnings: [] };
  snapshot.eveBriefing.packageValidation = validation;
  entries[0].data = JSON.stringify(snapshot.eveBriefing, null, 2);
  entries[1].data = JSON.stringify(snapshot, null, 2);
  entries.push({ name: "asset-index.json", data: JSON.stringify(fileIndex, null, 2) });
  entries.push({ name: "package-validation.json", data: JSON.stringify(validation, null, 2) });
  onProgress?.(1, "Building intelligence ZIP");
  return {
    blob: await createStoredZip(entries),
    validation,
    counts: {
      layers: snapshot.layers.length,
      reports: snapshot.layers.length,
      previews: fileIndex.length,
      fullResolutionAssets: fileIndex.filter((item) => item.fullPath).length,
      entries: entries.length,
      agentSkillFiles: skillPackage.entries.length,
    },
  };
}
