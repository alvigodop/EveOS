import { readImageBlob, slugify } from "../refinement/image-layer-utils.js";
import { ensureLayerAssets, getCanonicalLayer } from "../world/world-layer-store.js";
import { buildLayerReport, buildWorldReport, serializeLayer } from "./layer-report.js";
import { capabilityManifest } from "./eve-capabilities.js";
import { createStoredZip } from "./zip-store.js";
import { extractImageContainerMetadata } from "../refinement/image-container-metadata.js";
import { accuracyProfile, activeMissionPass, getActiveRefinementMission, nextMissionAction } from "../mission/refinement-mission-store.js";
import { evidenceProfile } from "../refinement/evidence-profile.js";
import { semanticSelectorManifest } from "./eve-semantic-selectors.js";
import { inspectMissionPrerequisites } from "../mission/mission-prerequisites.js";
import { buildEveBriefing } from "./eve-briefing.js";
import { refinementIntentManifest } from "../refinement/refinement-intent.js";
import { appendAgentSkillEntries } from "../agent-skill/agent-skill-exporter.js";
import { agentSkillCompatibility, availableSkillsManifest } from "../agent-skill/agent-skill-runtime.js";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

async function sha256Text(value) {
  if (!crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Preview encoding failed.")), "image/png",
  ));
}

async function previewBlob(layer, maximumWidth = 1024) {
  const ratio = layer.width && layer.height ? layer.height / layer.width : 0.5;
  const width = Math.min(maximumWidth, layer.width || maximumWidth);
  const height = Math.max(1, Math.round(width * ratio));
  const image = await readImageBlob(layer.blob, width, height);
  return canvasBlob(image.canvas);
}


function missionBrief(mission, record) {
  if (!mission) return "No active Refinement Mission.";
  const comparison = mission.latestComparison || {};
  return [
    "WORLD PORTAL REFINEMENT MISSION BRIEF",
    `World: ${record.name} (${record.id})`,
    `Mission: ${mission.name}`,
    `Stage: ${mission.stage}`,
    `Accuracy profile: ${mission.accuracyProfile || "balanced"}`,
    `Active pass: ${mission.activePassNumber || 0} (${mission.activePassId || "none"})`,
    `Baseline visual: ${mission.baseline?.visualLayerId || "none"}`,
    `Baseline mask: ${mission.baseline?.maskLayerId || "none"}`,
    `Baseline heightmap: ${mission.baseline?.heightmapLayerId || "none"}`,
    `Imported Orogen sessions: ${(mission.importedSessionIds || []).join(", ") || "none"}`,
    `Latest returned pass token: ${comparison.passToken || "unknown"}`,
    `Recognized returned roles: ${comparison.recognizedRoleCount || 0}`,
    `Dimension match: ${comparison.dimensionMatch === undefined ? "not checked" : comparison.dimensionMatch ? "yes" : "no"}`,
    `Anomaly warnings retained: ${comparison.anomalies?.length || 0}`,
    `Latest context: ${mission.latestContext?.hash || "not exported"}`,
    `Latest Agent plan: ${mission.latestPlan?.title || "not reviewed"}`,
    "",
    "Use the baseline and latest returned run as the primary comparison. Preserve anomalous runs as provisional evidence. Do not promote canonical layers without explicit user confirmation.",
  ].join("\n");
}


function missionControl(record, mission) {
  const active = mission || getActiveRefinementMission(record);
  const prerequisites = inspectMissionPrerequisites(record, active);
  const candidateSet = active?.candidateSets?.at(-1) || null;
  return {
    canCreateMission: !record.builtin,
    activeMissionId: active?.id || null,
    scope: active?.scope || { worldId: record.id, subjectId: null, subjectType: "planet", scopeMaskLayerId: null },
    currentStage: active?.stage || "not-created",
    currentPass: active ? activeMissionPass(active) : null,
    baseline: active?.baseline || prerequisites.current,
    missingPrerequisites: prerequisites.issues,
    proposedPrerequisiteRepair: prerequisites.proposed,
    nextAction: active ? nextMissionAction(record, active) : { id: "create", label: "Create Refinement Mission" },
    semanticSelectors: semanticSelectorManifest(),
    candidateStyles: ["clean", "hybrid", "feature-preserving"],
    generatedCandidateSets: active?.candidateSets || [],
    pendingDecision: active?.pendingDecision || null,
    resumeTokenAvailable: !!active?.resumeToken,
  };
}

function publicWorld(record) {
  return {
    id: record.id,
    name: record.name,
    builtin: !!record.builtin,
    schemaVersion: record.schemaVersion || null,
    surface: {
      name: record.surface?.textureName || null,
      width: record.surface?.width || null,
      height: record.surface?.height || null,
      projection: record.surface?.projection || "equirectangular",
    },
    metadataCounts: {
      continents: record.metadata?.continents?.length || 0,
      countries: Object.keys(record.metadata?.countriesByContinent || {}).reduce((sum, key) => (
        sum + (record.metadata.countriesByContinent[key]?.length || 0)
      ), 0),
      focusedCountries: Object.keys(record.metadata?.countryRecords || {}).length,
      celestialBodies: record.metadata?.celestialBodies?.length || 0,
    },
  };
}


function evidenceIndex(layers) {
  return layers.map((layer) => {
    const profile = evidenceProfile(layer);
    return {
      layerId: layer.id, name: layer.name, type: layer.type, status: profile.status,
      trust: profile.trust, automaticTrust: profile.autoTrust, reasons: profile.reasons || [],
      assimilation: layer.analysis?.assimilation || layer.metadata?.evidenceAssimilation || null,
      climateEvidenceAvailable: !!layer.metadata?.climateEvidence,
      environmentalZonesAvailable: !!(layer.metadata?.environmentalZones || layer.analysis?.environmentalZones),
    };
  });
}

function curatedEvidenceIds(layers, profile, excluded = new Set()) {
  const budget = ({ fast: 0, balanced: 3, high: 8, forensic: Infinity })[profile.id] ?? 3;
  return layers.filter((layer) => !excluded.has(layer.id)).map((layer) => {
    const evidence = evidenceProfile(layer);
    const maximumTrust = Math.max(...Object.values(evidence.trust || {}).map(Number));
    const bonus = evidence.status === "anomalous-useful" ? 0.2 : evidence.status === "canonical-safe" ? 0.1 : 0;
    return { layer, evidence, score: maximumTrust + bonus };
  }).filter((item) => !["rejected", "archived"].includes(item.evidence.status) && item.score >= 0.55)
    .sort((a, b) => b.score - a.score).slice(0, budget).map((item) => item.layer.id);
}

function statisticsIndex(layers) {
  return layers.map((layer) => ({
    layerId: layer.id,
    name: layer.name,
    type: layer.type,
    analysis: layer.analysis || null,
  }));
}

function sessionCopy(session) {
  return JSON.parse(JSON.stringify(session));
}

function previewFilename(layer) {
  return `previews/${slugify(layer.name)}-${layer.id.slice(-6)}.png`;
}

function fullFilename(layer) {
  const extension = layer.mimeType?.includes("jpeg") ? "jpg" : "png";
  return `selected-assets/${slugify(layer.name)}-${layer.id.slice(-6)}.${extension}`;
}

export async function createEveContextBundle({ record, state, engine, toolState = {}, includeFullResolution = false, includeAgentSkill = true, accuracyProfileId = "balanced", mission = null, selectedLayerIds = [], onProgress }) {
  const assets = ensureLayerAssets(record);
  const profile = accuracyProfile(accuracyProfileId);
  const canonicalIds = [
    getCanonicalLayer(record, "visual")?.id,
    getCanonicalLayer(record, "mask")?.id,
    getCanonicalLayer(record, "heightmap")?.id,
  ].filter(Boolean);
  const missionSessionIds = new Set(mission?.importedSessionIds || []);
  const relevantIds = new Set([
    ...canonicalIds, ...selectedLayerIds,
    mission?.baseline?.visualLayerId, mission?.baseline?.maskLayerId, mission?.baseline?.heightmapLayerId,
    ...assets.layers.filter((layer) => missionSessionIds.has(layer.sessionId)).map((layer) => layer.id),
  ].filter(Boolean));
  curatedEvidenceIds(assets.layers, profile, relevantIds).forEach((id) => relevantIds.add(id));
  const analysisLayers = profile.analyzeScope === "all" ? assets.layers
    : profile.analyzeScope === "all-session" ? assets.layers.filter((layer) => relevantIds.has(layer.id) || missionSessionIds.has(layer.sessionId))
      : assets.layers.filter((layer) => relevantIds.has(layer.id));
  for (let index = 0; index < analysisLayers.length; index += 1) {
    const layer = analysisLayers[index];
    if (!(layer.blob instanceof Blob)) continue;
    if (!layer.metadata?.imageContainer) {
      layer.metadata = { ...(layer.metadata || {}), imageContainer: await extractImageContainerMetadata(layer.blob) };
    }
    if (layer.analysisVersion === "2.0.0" && layer.analysis) continue;
    onProgress?.(index / Math.max(1, analysisLayers.length), `Analyzing ${layer.name}`);
    layer.analysis = await engine.analyze(layer);
    layer.analysis.file = {
      byteSize: layer.byteSize || layer.blob.size,
      mimeType: layer.mimeType || layer.blob.type,
      lastModified: layer.lastModified || null,
      checksum: layer.checksum || null,
      imageContainer: layer.metadata.imageContainer,
    };
    layer.analysisVersion = "2.0.0";
  }
  const serializedLayers = assets.layers.map(serializeLayer);
  const canonical = {
    visualLayerId: getCanonicalLayer(record, "visual")?.id || null,
    maskLayerId: getCanonicalLayer(record, "mask")?.id || null,
    heightmapLayerId: getCanonicalLayer(record, "heightmap")?.id || null,
  };
  const worldSummary = {
    ...publicWorld(record),
    canonical,
    activeViewState: record.viewState || {},
    counts: {
      layers: assets.layers.length,
      sessions: assets.analysisSessions.length,
      passes: assets.refinementPasses.length,
    },
  };
  const missionControlState = missionControl(record, mission);
  const metadataCore = {
    protocol: "world-portal-agent-context",
    legacyProtocol: "world-portal-eve-context",
    version: 1,
    exportedAt: new Date().toISOString(),
    world: worldSummary,
    capabilities: capabilityManifest(),
    layers: serializedLayers,
    sessions: assets.analysisSessions.map(sessionCopy),
    passes: assets.refinementPasses.map(sessionCopy),
    statistics: statisticsIndex(assets.layers),
    evidence: evidenceIndex(assets.layers),
    exportAudits: assets.orogen?.exportAudits || [],
    currentSettings: { worldView: { ...state }, ...toolState },
    mission: mission ? JSON.parse(JSON.stringify(mission)) : null,
    missionControl: missionControlState,
    agentSkill: { included: !!includeAgentSkill, ...agentSkillCompatibility() },
    availableSkills: availableSkillsManifest(),
    curation: { accuracyProfile: profile, selectedLayerIds: [...relevantIds] },
  };
  const contextHash = await sha256Text(stableJson(metadataCore));
  const manifest = {
    protocol: metadataCore.protocol,
    version: metadataCore.version,
    contextHash,
    exportedAt: metadataCore.exportedAt,
    worldId: record.id,
    worldName: record.name,
    previewPolicy: `${profile.label}: previews up to ${profile.previewWidth} pixels wide for curated evidence.`,
    fullResolutionIncluded: !!includeFullResolution,
    accuracyProfile: profile.id,
    agentSkill: { included: !!includeAgentSkill, ...agentSkillCompatibility() },
    availableSkills: availableSkillsManifest(),
    note: "Upload this ZIP to any compatible AI agent. Read eve-briefing.json and agent-skill/SKILL.md first, then return a declarative world-portal-agent-plan.",
    missionControl: {
      canCreateMission: missionControlState.canCreateMission,
      activeMissionId: missionControlState.activeMissionId,
      currentStage: missionControlState.currentStage,
      pendingDecision: missionControlState.pendingDecision?.type || null,
    },
  };
  const entries = [
    { name: "manifest.json", data: "" },
    { name: "world-summary.json", data: JSON.stringify(worldSummary, null, 2) },
    { name: "capabilities.json", data: JSON.stringify(metadataCore.capabilities, null, 2) },
    { name: "layers.json", data: JSON.stringify(serializedLayers, null, 2) },
    { name: "sessions.json", data: JSON.stringify(metadataCore.sessions, null, 2) },
    { name: "passes.json", data: JSON.stringify(metadataCore.passes, null, 2) },
    { name: "statistics.json", data: JSON.stringify(metadataCore.statistics, null, 2) },
    { name: "evidence-index.json", data: JSON.stringify(metadataCore.evidence, null, 2) },
    { name: "export-audits.json", data: JSON.stringify(metadataCore.exportAudits, null, 2) },
    { name: "current-settings.json", data: JSON.stringify(metadataCore.currentSettings, null, 2) },
    { name: "curation.json", data: JSON.stringify(metadataCore.curation, null, 2) },
    { name: "mission-control.json", data: JSON.stringify(metadataCore.missionControl, null, 2) },
    ...(mission ? [
      { name: "refinement-mission.json", data: JSON.stringify(mission, null, 2) },
      { name: "mission-brief.txt", data: missionBrief(mission, record) },
    ] : []),
    { name: "chat-report.txt", data: buildWorldReport(record) },
  ];
  const seen = new Map();
  const reportIds = new Set(analysisLayers.map((layer) => layer.id));
  const previewLayers = profile.analyzeScope === "all" ? assets.layers
    : assets.layers.filter((layer) => relevantIds.has(layer.id));
  const fullIds = new Set(includeFullResolution
    ? [...canonicalIds, ...(profile.includeFullRecommended ? [...relevantIds] : [])] : []);
  for (let index = 0; index < assets.layers.length; index += 1) {
    const layer = assets.layers[index];
    if (reportIds.has(layer.id)) {
      entries.push({ name: `layer-reports/${slugify(layer.name)}-${layer.id.slice(-6)}.txt`, data: buildLayerReport(layer, { worldName: record.name }) });
    }
    if (!(layer.blob instanceof Blob) || !previewLayers.some((item) => item.id === layer.id)) continue;
    onProgress?.(index / Math.max(1, assets.layers.length), `Preparing ${layer.name}`);
    const duplicateKey = layer.checksum || `${layer.byteSize}:${layer.width}:${layer.height}:${layer.filename}`;
    if (!seen.has(duplicateKey)) {
      const previewName = previewFilename(layer);
      entries.push({ name: previewName, data: await previewBlob(layer, profile.previewWidth) });
      seen.set(duplicateKey, previewName);
    }
    if (fullIds.has(layer.id)) entries.push({ name: fullFilename(layer), data: layer.blob });
  }
  const index = serializedLayers.map((layer) => {
    const previewPath = seen.get(layer.checksum || `${layer.byteSize}:${layer.width}:${layer.height}:${layer.filename}`) || null;
    const reportPath = reportIds.has(layer.id)
      ? `layer-reports/${slugify(layer.name)}-${layer.id.slice(-6)}.txt` : null;
    const fullPath = fullIds.has(layer.id) ? fullFilename(layer) : null;
    return {
      id: layer.id,
      layerId: layer.id,
      name: layer.name,
      role: layer.type,
      filename: layer.filename,
      mimeType: layer.mimeType,
      width: layer.width,
      height: layer.height,
      checksum: layer.checksum,
      sessionId: layer.sessionId,
      passId: layer.passId,
      parentLayerIds: layer.parentLayerIds || [],
      path: fullPath || previewPath || reportPath,
      previewPath,
      reportPath,
      fullPath,
      recommendedForAnalysis: relevantIds.has(layer.id),
    };
  });
  entries.push({ name: "asset-index.json", data: JSON.stringify(index, null, 2) });
  let skillPackage = null;
  if (includeAgentSkill) {
    onProgress?.(0.97, "Adding portable Agent Skill");
    skillPackage = await appendAgentSkillEntries(entries, { prefix: "agent-skill" });
  }
  const packagePaths = new Set(entries.map((entry) => entry.name));
  const packageErrors = index.flatMap((item) => [item.previewPath, item.reportPath, item.fullPath]
    .filter(Boolean).filter((path) => !packagePaths.has(path)).map((path) => `Missing ZIP entry ${path}`));
  if (includeAgentSkill) {
    for (const required of ["agent-skill/SKILL.md", "agent-skill/skill-manifest.json", "agent-skill/capabilities.json", "agent-skill/parameter-ranges.json"]) {
      if (!packagePaths.has(required)) packageErrors.push(`Missing Agent Skill entry ${required}`);
    }
  }
  const packageValidation = { valid: packageErrors.length === 0, errors: packageErrors, warnings: [] };
  const briefing = buildEveBriefing({
    record,
    fileIndex: index,
    comparisonSummary: mission?.latestComparison ? [mission.latestComparison] : [],
    settings: metadataCore.currentSettings,
    packageValidation,
    mode: profile.id,
  });
  briefing.availableCapabilities = metadataCore.capabilities;
  briefing.parameterRanges = refinementIntentManifest();
  briefing.agentSkill = agentSkillCompatibility();
  briefing.availableSkills = availableSkillsManifest().map((skill) => skill.id);
  entries.push({ name: "eve-briefing.json", data: JSON.stringify(briefing, null, 2) });
  entries.push({ name: "package-validation.json", data: JSON.stringify(packageValidation, null, 2) });
  manifest.previewCount = seen.size;
  manifest.fullAssetCount = fullIds.size;
  manifest.curatedLayerCount = relevantIds.size;
  manifest.reportCount = reportIds.size;
  manifest.eveBriefing = "eve-briefing.json";
  manifest.agentSkillEntrypoint = includeAgentSkill ? "agent-skill/SKILL.md" : null;
  manifest.agentSkillFiles = skillPackage?.entries?.length || 0;
  manifest.packageValidation = packageValidation;
  entries[0].data = JSON.stringify(manifest, null, 2);
  onProgress?.(1, "Building agent-ready World Portal context ZIP");
  return { blob: await createStoredZip(entries), manifest, entries: entries.length };
}
