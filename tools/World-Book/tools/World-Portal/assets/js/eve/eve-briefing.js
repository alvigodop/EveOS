import { ensureLayerAssets, getCanonicalLayer, getLayer, layerDomain } from "../world/world-layer-store.js";
import { activeMissionPass, getActiveRefinementMission, nextMissionAction } from "../mission/refinement-mission-store.js";
import { selectedMissionCandidate } from "../mission/mission-candidates.js";
import { evidenceProfile } from "../refinement/evidence-profile.js";
import { serializeLayer } from "./layer-report.js";
import { agentSkillCompatibility, availableSkillsManifest } from "../agent-skill/agent-skill-runtime.js";

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function latestAudit(assets) { return assets.orogen?.exportAudits?.at(-1) || null; }

function layerSummary(layer) {
  if (!layer) return null;
  const analysis = layer.analysis || {};
  const evidence = evidenceProfile(layer);
  return {
    ...serializeLayer(layer),
    domain: layerDomain(layer.type),
    evidence,
    cacheState: layer.metadata?.analysisCache?.state
      || (layer.analysisVersion === "2.0.0" && layer.analysis ? "cached" : "stale"),
    keyStatistics: {
      landPixelCount: number(analysis.landPixels || analysis.nonzeroPixels),
      componentCount: number(analysis.componentCount || analysis.landmassCount),
      landCoverage: analysis.landCoverage ?? null,
      sphericalLandCoverage: analysis.sphericalLandCoverage ?? null,
      coastlineComplexity: analysis.coastlineComplexity ?? null,
      minimumElevation: analysis.minimumLand ?? analysis.minimumLandElevation ?? null,
      maximumElevation: analysis.maximumElevation ?? analysis.maximumLandElevation ?? null,
      clippedPeakShare: analysis.clippedPeakShare ?? null,
      nearBlackLandShare: analysis.nearBlackLand?.share1to8 ?? null,
      orogenReady: analysis.orogenReady ?? null,
      anomalyFlags: analysis.anomalyFlags || [],
    },
  };
}

function candidateSummary(record, mission, candidate) {
  const mask = getLayer(record, candidate.maskLayerId);
  const heightmap = getLayer(record, candidate.heightmapLayerId);
  const baselineMask = getLayer(record, mission?.baseline?.maskLayerId);
  const land = number(mask?.analysis?.landPixels || mask?.analysis?.nonzeroPixels || candidate.summary?.landPixels);
  const baselineLand = number(baselineMask?.analysis?.landPixels || baselineMask?.analysis?.nonzeroPixels);
  return {
    id: candidate.id,
    style: candidate.style,
    label: candidate.label,
    missionId: mission?.id || null,
    passId: candidate.missionPassId || candidate.summary?.missionPassId || null,
    maskLayerId: candidate.maskLayerId,
    heightmapLayerId: candidate.heightmapLayerId,
    baselineMaskLayerId: mission?.baseline?.maskLayerId || null,
    baselineHeightmapLayerId: mission?.baseline?.heightmapLayerId || null,
    evidenceLayerIds: [...new Set([
      ...(mask?.parentLayerIds || []), ...(heightmap?.parentLayerIds || []),
    ])],
    landPixels: land,
    componentCount: number(mask?.analysis?.componentCount || mask?.analysis?.landmassCount || candidate.summary?.componentCount),
    addedLandVersusBaseline: Math.max(0, land - baselineLand),
    removedLandVersusBaseline: Math.max(0, baselineLand - land),
    preservedCompanionIslands: number(candidate.summary?.preservedCompanionIslands),
    rejectedRemoteComponents: number(candidate.summary?.rejectedRemoteComponents),
    coastlineComplexity: mask?.analysis?.coastlineComplexity ?? candidate.summary?.coastlineComplexity ?? null,
    minimumElevation: heightmap?.analysis?.minimumLand ?? heightmap?.analysis?.minimumLandElevation ?? candidate.summary?.minimumElevation ?? null,
    maximumElevation: heightmap?.analysis?.maximumElevation ?? heightmap?.analysis?.maximumLandElevation ?? candidate.summary?.maximumElevation ?? null,
    ridgeRetention: candidate.summary?.ridgeRetention ?? candidate.settings?.ridgeRetention ?? null,
    valleyRetention: candidate.settings?.valleyRetention ?? null,
    supportAgreement: candidate.summary?.supportAgreement ?? null,
    anomalyFlags: [
      ...(mask?.analysis?.anomalyFlags || []), ...(heightmap?.analysis?.anomalyFlags || []),
    ],
    orogenReady: candidate.summary?.orogenReady ?? null,
    selected: mission?.selectedCandidateId === candidate.id,
    accepted: candidate.status === "accepted",
    exported: mission?.lastExport?.selectedCandidateId === candidate.id,
    status: candidate.status,
  };
}

function allCandidates(record, mission) {
  return (mission?.candidateSets || []).flatMap((set) => (
    (set.candidates || []).map((candidate) => candidateSummary(record, mission, candidate))
  ));
}

function evidenceRecommendations(layers) {
  return layers.map((layer) => {
    const profile = evidenceProfile(layer);
    if (["rejected", "archived"].includes(profile.status)) return null;
    const uses = [];
    const forbidden = [];
    if (profile.trust.coastline >= 0.55) uses.push("coastline-evidence");
    else forbidden.push("coastline-authority");
    if (profile.trust.height >= 0.55) uses.push("interior-elevation-detail");
    if (profile.trust.visual >= 0.55) uses.push("land-only-visual-synthesis");
    if (profile.trust.climate >= 0.55) uses.push("climate-metadata-evidence");
    if (profile.status === "anomalous-useful") forbidden.push("automatic-canonical-promotion");
    return {
      layerId: layer.id,
      status: profile.status,
      recommendedUses: uses,
      forbiddenUses: forbidden,
      reason: (profile.reasons || []).join("; ") || "Trust values are role-specific.",
    };
  }).filter(Boolean);
}

function currentDecision(record, mission, selected, audit) {
  if (audit && audit.status === "blocked") {
    return {
      type: "export-blocked",
      status: "blocked",
      question: "Repair the selected-source export and rebuild the Orogen input?",
      selectedCandidateId: selected?.id || null,
      selectedStyle: selected?.style || null,
      blockingIssues: [audit.error || "The export was blocked."],
      nextAllowedActions: ["repair-export-selection", "rebuild-selected-orogen-input"],
    };
  }
  if (audit && audit.sourceMatch === false) {
    return {
      type: "candidate-export-mismatch",
      status: "blocked",
      question: "Should the selected candidate be finalized and exported?",
      selectedCandidateId: selected?.id || null,
      selectedStyle: selected?.style || null,
      blockingIssues: ["Requested and resolved exporter source layers differ."],
      nextAllowedActions: ["repair-export-selection", "rebuild-selected-orogen-input"],
    };
  }
  if (mission?.pendingDecision) return { ...mission.pendingDecision, status: "pending" };
  return {
    type: mission ? "mission-next-action" : "mission-creation",
    status: "ready",
    question: mission ? nextMissionAction(record, mission).label : "Create or ensure a refinement mission.",
    selectedCandidateId: selected?.id || null,
    selectedStyle: selected?.style || null,
    blockingIssues: [],
    nextAllowedActions: [mission ? nextMissionAction(record, mission).id : "mission.ensure"],
  };
}

function plainBrief(record, mission, canonical, selected, candidates, audit) {
  const mask = canonical.mask;
  const selectedSummary = candidates.find((item) => item.id === selected?.id);
  const parts = [
    `${record.name} has ${mask?.width || "unknown"} × ${mask?.height || "unknown"} canonical map assets.`,
    mission ? `${mission.name} is at stage ${mission.stage}, pass ${mission.activePassNumber || 0}.` : "No refinement mission exists yet.",
  ];
  if (selectedSummary) {
    parts.push(`${selectedSummary.label} is selected with ${selectedSummary.landPixels.toLocaleString()} land pixels and ${selectedSummary.componentCount} connected components.`);
    if (selectedSummary.addedLandVersusBaseline) parts.push(`It adds ${selectedSummary.addedLandVersusBaseline.toLocaleString()} land pixels beyond the current baseline.`);
  }
  if (audit) {
    const exportedLand = audit.finalization?.finalLandPixelCount;
    parts.push(`Latest export audit ${audit.status}${Number.isFinite(exportedLand) ? ` recorded ${exportedLand.toLocaleString()} final land pixels` : ""}.`);
    if (audit.sourceMatch === false || audit.status === "blocked") parts.push("The latest export did not resolve the requested selected source and requires correction before another Orogen pass.");
  }
  return parts.join(" ");
}

function creativeIntent(record, mission) {
  return mission?.creativeIntent || mission?.intent || record.metadata?.creativeIntent || record.worldAssets?.creativeIntent || null;
}

export function buildEveBriefing({ record, fileIndex = [], comparisonSummary = [], settings = {}, packageValidation = null, mode = "balanced" } = {}) {
  const assets = ensureLayerAssets(record);
  const mission = getActiveRefinementMission(record);
  const selected = selectedMissionCandidate(mission);
  const pass = activeMissionPass(mission);
  const audit = latestAudit(assets);
  const canonical = {
    visual: layerSummary(getCanonicalLayer(record, "visual")),
    mask: layerSummary(getCanonicalLayer(record, "mask")),
    heightmap: layerSummary(getCanonicalLayer(record, "heightmap")),
  };
  const candidates = allCandidates(record, mission);
  const layers = assets.layers.map(layerSummary);
  const recommended = evidenceRecommendations(assets.layers);
  const excluded = assets.layers.filter((layer) => ["rejected", "archived"].includes(evidenceProfile(layer).status))
    .map((layer) => ({ layerId: layer.id, status: evidenceProfile(layer).status }));
  return {
    format: "world-portal-eve-briefing",
    version: 1,
    modelNeutral: true,
    canonicalPlanProtocol: "world-portal-agent-plan",
    legacyPlanProtocol: "world-portal-eve-plan",
    createdAt: new Date().toISOString(),
    mode,
    agentSkill: agentSkillCompatibility(),
    availableSkills: availableSkillsManifest().map((skill) => skill.id),
    creativeIntent: creativeIntent(record, mission),
    world: { id: record.id, name: record.name, schemaVersion: record.schemaVersion || null },
    scope: mission?.scope || { worldId: record.id, subjectId: null, subjectType: "planet", scopeMaskLayerId: null },
    mission: mission ? {
      id: mission.id,
      name: mission.name,
      stage: mission.stage,
      activePassNumber: mission.activePassNumber,
      activePassId: mission.activePassId,
      currentPass: pass,
      baseline: mission.baseline,
      pendingDecision: mission.pendingDecision,
      nextAction: nextMissionAction(record, mission),
    } : null,
    currentDecision: currentDecision(record, mission, selected, audit),
    canonicalState: canonical,
    selectedCandidate: candidates.find((item) => item.id === selected?.id) || null,
    candidateSummary: candidates,
    latestOrogenSession: assets.analysisSessions.at(-1) || null,
    evidenceSummary: { total: recommended.length, items: recommended },
    anomalySummary: layers.filter((layer) => layer.keyStatistics.anomalyFlags.length).map((layer) => ({
      layerId: layer.id, name: layer.name, flags: layer.keyStatistics.anomalyFlags,
    })),
    comparisonSummary,
    exportState: { latestAudit: audit, lastFinalization: assets.orogen?.lastFinalization || null },
    recommendedEvidence: recommended,
    excludedEvidence: excluded,
    availableCapabilities: [],
    parameterRanges: {},
    settings,
    layerCount: layers.length,
    fileIndex,
    warnings: [
      ...(audit?.sourceMatch === false ? ["Latest export requested and resolved different sources."] : []),
      ...(audit?.status === "blocked" ? [audit.error || "Latest export was blocked."] : []),
    ],
    missingInformation: [],
    packageValidation: packageValidation || { valid: true, errors: [], warnings: [] },
    plainLanguageBrief: plainBrief(record, mission, canonical, selected, candidates, audit),
  };
}
