import {
  ensureLayerAssets, getCanonicalLayer, getLayer, markLayerCanonical,
} from "../world/world-layer-store.js";

const MISSION_SCHEMA_VERSION = 2;
const STAGES = Object.freeze({
  BASELINE_REQUIRED: "baseline-required",
  BASELINE_READY: "baseline-ready",
  AWAITING_OROGEN: "awaiting-orogen",
  RESULTS_IMPORTED: "results-imported",
  EVE_CONTEXT_READY: "eve-context-ready",
  EVE_PLAN_READY: "eve-plan-ready",
  CONFIRMATION_REQUIRED: "confirmation-required",
  REVIEW_REQUIRED: "review-required",
  NEXT_INPUT_READY: "next-input-ready",
  COMPLETE: "complete",
});

function slugify(value) {
  return String(value || "mission").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mission";
}
function uniqueId(prefix) {
  return `${slugify(prefix)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function now() { return new Date().toISOString(); }
function copy(value) { return JSON.parse(JSON.stringify(value ?? null)); }

export const MISSION_ACCURACY_PROFILES = Object.freeze({
  fast: {
    id: "fast", label: "Fast review", previewWidth: 512,
    analyzeScope: "mission", includeSessionVisuals: false,
    includeFullRecommended: false, roleConfidence: 0.72,
    strictDimensionMatch: false, description: "Small context, quick comparisons, tolerant intake.",
  },
  balanced: {
    id: "balanced", label: "Balanced", previewWidth: 1024,
    analyzeScope: "relevant", includeSessionVisuals: true,
    includeFullRecommended: false, roleConfidence: 0.82,
    strictDimensionMatch: true, description: "Recommended detail and context size for normal refinement.",
  },
  high: {
    id: "high", label: "High accuracy", previewWidth: 2048,
    analyzeScope: "all-session", includeSessionVisuals: true,
    includeFullRecommended: true, roleConfidence: 0.90,
    strictDimensionMatch: true, description: "Larger previews, full baseline assets, stricter run matching.",
  },
  forensic: {
    id: "forensic", label: "Forensic", previewWidth: 2048,
    analyzeScope: "all", includeSessionVisuals: true,
    includeFullRecommended: true, roleConfidence: 0.96,
    strictDimensionMatch: true, description: "All layer evidence, hashes, anomalies, and no uncertain auto-attachment.",
  },
});

export function accuracyProfile(profileId) {
  return MISSION_ACCURACY_PROFILES[profileId] || MISSION_ACCURACY_PROFILES.balanced;
}

function baselineFromRecord(record) {
  return {
    visualLayerId: getCanonicalLayer(record, "visual")?.id || null,
    maskLayerId: getCanonicalLayer(record, "mask")?.id || null,
    heightmapLayerId: getCanonicalLayer(record, "heightmap")?.id || null,
  };
}

export function normalizeMissionScope(record, scope = {}) {
  const subjectTypes = new Set(["planet", "continent", "island", "region", "custom-map"]);
  return {
    worldId: record.id,
    subjectId: scope.subjectId || null,
    subjectType: subjectTypes.has(scope.subjectType) ? scope.subjectType : "planet",
    scopeMaskLayerId: scope.scopeMaskLayerId || null,
  };
}

function normalizeMission(mission, record) {
  mission.worldId = record.id;
  mission.name = String(mission.name || `${record.name} Refinement Mission`);
  mission.missionType = mission.missionType || "orogen-refinement";
  mission.scope = normalizeMissionScope(record, mission.scope);
  mission.stage = Object.values(STAGES).includes(mission.stage) ? mission.stage : STAGES.BASELINE_REQUIRED;
  mission.accuracyProfile = accuracyProfile(mission.accuracyProfile).id;
  mission.createdAt = mission.createdAt || now();
  mission.updatedAt = mission.updatedAt || mission.createdAt;
  mission.baseline = { ...baselineFromRecord(record), ...(mission.baseline || {}) };
  if (!Array.isArray(mission.passes)) mission.passes = [];
  if (!Array.isArray(mission.checkpoints)) mission.checkpoints = [];
  if (!Array.isArray(mission.importedSessionIds)) mission.importedSessionIds = [];
  if (!Array.isArray(mission.candidateSets)) mission.candidateSets = [];
  if (mission.pendingDecision === undefined) mission.pendingDecision = null;
  if (mission.selectedCandidateId === undefined) mission.selectedCandidateId = null;
  if (mission.resumeToken === undefined) mission.resumeToken = null;
  if (!mission.expectedOutputs) mission.expectedOutputs = {
    roles: ["orogen-land-mask", "orogen-land-heightmap", "satellite", "climate"],
    filenamePatterns: ["orogen-landmask-*", "orogen-land-heightmap-*", "orogen-satellite-*", "orogen-climate-*"],
  };
  return mission;
}

export function ensureMissionAssets(record) {
  const assets = ensureLayerAssets(record);
  assets.missionSchemaVersion = Math.max(Number(assets.missionSchemaVersion) || 0, MISSION_SCHEMA_VERSION);
  if (!Array.isArray(assets.refinementMissions)) assets.refinementMissions = [];
  if (assets.activeRefinementMissionId === undefined) assets.activeRefinementMissionId = null;
  for (const mission of assets.refinementMissions) normalizeMission(mission, record);
  return assets;
}

export function createRefinementMission(record, options = {}) {
  const assets = ensureMissionAssets(record);
  const baseline = { ...baselineFromRecord(record), ...(options.baseline || {}) };
  const ready = !!(baseline.maskLayerId && baseline.heightmapLayerId);
  const mission = normalizeMission({
    id: options.id || uniqueId(`${record.name}-mission`),
    idempotencyKey: options.idempotencyKey || null,
    name: options.name || `${record.name} Refinement Mission`,
    missionType: options.missionType || "orogen-refinement",
    scope: options.scope || {},
    accuracyProfile: options.accuracyProfile || "balanced",
    stage: ready ? STAGES.BASELINE_READY : STAGES.BASELINE_REQUIRED,
    baseline,
    activePassNumber: 0,
    activePassId: null,
    passes: [], checkpoints: [], candidateSets: [],
    latestComparison: null, latestContext: null, latestPlan: null,
    latestExecution: null, lastExport: null, importedSessionIds: [],
    pendingDecision: null, selectedCandidateId: null, resumeToken: null,
  }, record);
  assets.refinementMissions.push(mission);
  assets.activeRefinementMissionId = mission.id;
  createMissionCheckpoint(record, mission, "Mission created");
  return mission;
}

export function ensureRefinementMission(record, options = {}) {
  const assets = ensureMissionAssets(record);
  const active = getActiveRefinementMission(record);
  if (active) return { mission: active, created: false };
  const duplicate = options.idempotencyKey
    ? assets.refinementMissions.find((item) => item.idempotencyKey === options.idempotencyKey)
    : null;
  if (duplicate) {
    assets.activeRefinementMissionId = duplicate.id;
    return { mission: duplicate, created: false };
  }
  return { mission: createRefinementMission(record, options), created: true };
}

export function getActiveRefinementMission(record) {
  const assets = ensureMissionAssets(record);
  return assets.refinementMissions.find((mission) => mission.id === assets.activeRefinementMissionId) || null;
}

export function getRefinementMission(record, missionId) {
  return ensureMissionAssets(record).refinementMissions.find((mission) => mission.id === missionId) || null;
}

export function setActiveRefinementMission(record, missionId) {
  const assets = ensureMissionAssets(record);
  const mission = getRefinementMission(record, missionId);
  if (!mission) throw new Error("Refinement mission is unavailable.");
  assets.activeRefinementMissionId = mission.id;
  return mission;
}

export function updateMission(record, mission, patch = {}) {
  if (!mission || mission.worldId !== record.id) throw new Error("Mission does not belong to the active world.");
  Object.assign(mission, patch, { updatedAt: now() });
  return normalizeMission(mission, record);
}

export function syncMissionBaseline(record, mission, options = {}) {
  const baseline = options.preserve ? { ...baselineFromRecord(record), ...(mission.baseline || {}) } : baselineFromRecord(record);
  mission.baseline = baseline;
  if (baseline.maskLayerId && baseline.heightmapLayerId && mission.stage === STAGES.BASELINE_REQUIRED) {
    mission.stage = STAGES.BASELINE_READY;
  }
  mission.updatedAt = now();
  return baseline;
}

export function attachMissionBaseline(record, mission, baseline = {}) {
  const next = { ...mission.baseline, ...baseline };
  for (const id of Object.values(next).filter(Boolean)) {
    if (!getLayer(record, id)) throw new Error(`Mission baseline layer ${id} is unavailable.`);
  }
  mission.baseline = next;
  mission.stage = next.maskLayerId && next.heightmapLayerId ? STAGES.BASELINE_READY : STAGES.BASELINE_REQUIRED;
  mission.updatedAt = now();
  return next;
}

export function createMissionCheckpoint(record, mission, reason, extra = {}) {
  const baseline = baselineFromRecord(record);
  const checkpoint = {
    id: uniqueId("mission-checkpoint"), createdAt: now(), reason,
    canonical: baseline, activeVisualLayerId: baseline.visualLayerId,
    missionStage: mission.stage, activePassId: mission.activePassId || null,
    selectedCandidateId: mission.selectedCandidateId || null,
    ...copy(extra),
  };
  mission.checkpoints.push(checkpoint);
  mission.checkpoints = mission.checkpoints.slice(-25);
  mission.updatedAt = now();
  return checkpoint;
}

export function restorePreviousAcceptedCheckpoint(record, mission) {
  const checkpoint = [...mission.checkpoints].reverse().find((item) => (
    item.canonical?.maskLayerId && item.canonical?.heightmapLayerId
    && item.id !== mission.checkpoints.at(-1)?.id
  ));
  if (!checkpoint) throw new Error("No earlier accepted mission checkpoint is available.");
  const ids = checkpoint.canonical;
  for (const id of [ids.maskLayerId, ids.heightmapLayerId, ids.visualLayerId].filter(Boolean)) {
    if (!getLayer(record, id)) throw new Error("A checkpoint layer was removed and cannot be restored.");
    markLayerCanonical(record, id);
  }
  mission.baseline = { ...ids };
  mission.stage = STAGES.BASELINE_READY;
  mission.activePassId = checkpoint.activePassId || null;
  mission.selectedCandidateId = checkpoint.selectedCandidateId || null;
  createMissionCheckpoint(record, mission, `Returned to ${checkpoint.reason}`, { restoredFrom: checkpoint.id });
  return checkpoint;
}

export function createMissionPass(record, mission, options = {}) {
  const number = Math.max(1, Number(mission.activePassNumber || 0) + 1);
  const pass = {
    id: options.id || uniqueId(`mission-pass-${number}`), number,
    name: options.name || `${mission.name} Pass ${number}`,
    createdAt: now(), updatedAt: now(), status: options.status || "baseline-prepared",
    baseline: copy(options.baseline || mission.baseline), export: options.export || null,
    importedSessionIds: [...(options.importedSessionIds || [])], comparison: options.comparison || null,
    eveContext: options.eveContext || null, evePlan: options.evePlan || null,
    acceptedLayerIds: [...(options.acceptedLayerIds || [])], candidateSetId: options.candidateSetId || null,
    selectedCandidateId: options.selectedCandidateId || null, notes: String(options.notes || ""),
  };
  mission.passes.push(pass);
  mission.activePassNumber = number;
  mission.activePassId = pass.id;
  mission.updatedAt = now();
  return pass;
}

export function activeMissionPass(mission) {
  return mission?.passes?.find((pass) => pass.id === mission.activePassId) || mission?.passes?.at(-1) || null;
}

export function nextMissionAction(record, mission) {
  if (!mission) return { id: "create", label: "Create Refinement Mission", stage: "none" };
  syncMissionBaseline(record, mission, { preserve: true });
  const labels = {
    [STAGES.BASELINE_REQUIRED]: ["open-forge", "Prepare Baseline in Heightmap Forge"],
    [STAGES.BASELINE_READY]: ["export-baseline", "Send Baseline to Orogen"],
    [STAGES.AWAITING_OROGEN]: ["import-results", "Import Orogen Results"],
    [STAGES.RESULTS_IMPORTED]: ["ask-eve", "Ask Eve to Review"],
    [STAGES.EVE_CONTEXT_READY]: ["import-plan", "Import Eve Recommendation"],
    [STAGES.EVE_PLAN_READY]: ["apply-plan", "Apply Eve Recommendation"],
    [STAGES.CONFIRMATION_REQUIRED]: ["confirm", "Review Canonical Changes"],
    [STAGES.REVIEW_REQUIRED]: ["review-candidates", "Review Generated Candidates"],
    [STAGES.NEXT_INPUT_READY]: ["build-next", "Build Next Orogen Input"],
    [STAGES.COMPLETE]: ["export-baseline", "Start Next Refinement Pass"],
  };
  const [id, label] = labels[mission.stage] || labels[STAGES.BASELINE_READY];
  return { id, label, stage: mission.stage };
}

export function missionStageLabel(stage) {
  return ({
    [STAGES.BASELINE_REQUIRED]: "Baseline not prepared",
    [STAGES.BASELINE_READY]: "Baseline prepared",
    [STAGES.AWAITING_OROGEN]: "Awaiting Orogen results",
    [STAGES.RESULTS_IMPORTED]: "Results imported",
    [STAGES.EVE_CONTEXT_READY]: "Waiting for Eve review",
    [STAGES.EVE_PLAN_READY]: "Eve plan ready",
    [STAGES.CONFIRMATION_REQUIRED]: "Canonical confirmation required",
    [STAGES.REVIEW_REQUIRED]: "Candidate review required",
    [STAGES.NEXT_INPUT_READY]: "Next Orogen input ready",
    [STAGES.COMPLETE]: "Pass complete",
  })[stage] || "Mission ready";
}

export const REFINEMENT_MISSION_STAGES = STAGES;
