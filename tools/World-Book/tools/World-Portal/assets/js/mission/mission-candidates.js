import {
  getLayer, markLayerCanonical,
} from "../world/world-layer-store.js";
import { activeMissionPass, createMissionCheckpoint, createMissionPass, REFINEMENT_MISSION_STAGES } from "./refinement-mission-store.js";
import { resolveRefinementIntent } from "../refinement/refinement-intent.js";

function now() { return new Date().toISOString(); }
function uniqueId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

function candidateSummary(record, candidate) {
  const mask = getLayer(record, candidate.maskLayerId);
  const height = getLayer(record, candidate.heightmapLayerId);
  const maskAnalysis = mask?.analysis || {};
  const heightAnalysis = height?.analysis || {};
  return {
    id: candidate.id,
    style: candidate.style,
    label: candidate.label,
    maskLayerId: candidate.maskLayerId,
    heightmapLayerId: candidate.heightmapLayerId,
    landPixels: Number(maskAnalysis.landPixels || maskAnalysis.nonzeroPixels || 0),
    componentCount: Number(maskAnalysis.componentCount || maskAnalysis.landmassCount || 0),
    preservedCompanionIslands: Number(maskAnalysis.assimilation?.preservedNearbyComponents || 0),
    rejectedRemoteComponents: Number(maskAnalysis.assimilation?.rejectedRemoteComponents || 0),
    recoveredCoastlinePixels: Number(maskAnalysis.assimilation?.recoveredPixels || 0),
    coastlineComplexity: Number(maskAnalysis.coastlineComplexity || 0),
    minimumElevation: Number(heightAnalysis.minimumLandElevation ?? heightAnalysis.minimum ?? 0),
    maximumElevation: Number(heightAnalysis.maximumLandElevation ?? heightAnalysis.maximum ?? 0),
    ridgeRetention: Number(heightAnalysis.assimilation?.ridgeRetention ?? candidate.settings?.ridgeRetention ?? 0),
    supportAgreement: !heightAnalysis.anomalyFlags?.some((flag) => /outside|support|ocean elevation/i.test(String(flag))),
    orogenReady: maskAnalysis.orogenReady !== false && heightAnalysis.orogenReady !== false,
  };
}

export async function buildMissionCandidates({ record, mission, commands, styles, inputs, intent = {} }) {
  const requested = styles?.length ? styles : ["clean", "hybrid", "feature-preserving"];
  const candidateSet = {
    id: uniqueId("candidate-set"),
    createdAt: now(), missionId: mission.id, missionPassId: mission.activePassId || null,
    baseline: { ...mission.baseline }, scope: { ...mission.scope }, candidates: [], selectedCandidateId: null,
    sourceSessionId: inputs.sessionId || null, status: "generated",
  };
  for (const style of requested) {
    const resolved = resolveRefinementIntent({ ...intent, style });
    const result = await commands.buildEvidenceNextPass({
      canonicalMaskLayerId: inputs.canonicalMaskLayerId || mission.baseline.maskLayerId,
      canonicalHeightmapLayerId: inputs.canonicalHeightmapLayerId || mission.baseline.heightmapLayerId,
      maskEvidenceLayerIds: inputs.maskEvidenceLayerIds || [],
      maskEvidenceWeights: inputs.maskEvidenceWeights || [],
      heightEvidenceLayerIds: inputs.heightEvidenceLayerIds || [],
      heightEvidenceWeights: inputs.heightEvidenceWeights || [],
      sessionId: inputs.sessionId || null,
      missionId: mission.id,
      missionPassId: mission.activePassId || null,
      settings: resolved.settings,
      name: `${mission.name} ${resolved.style} candidate`,
      notes: `Generated for mission review using ${resolved.style} intent.`,
    });
    const candidate = {
      id: uniqueId(`candidate-${resolved.style}`), style: resolved.style,
      label: resolved.style === "feature" ? "Feature-Preserving" : resolved.style[0].toUpperCase() + resolved.style.slice(1),
      maskLayerId: result.generatedMaskLayerId,
      heightmapLayerId: result.generatedHeightmapLayerId,
      refinementPassId: result.refinementPassId,
      candidateSetId: candidateSet.id,
      settings: resolved.settings,
      intent: resolved.intent,
      createdAt: now(), status: "provisional",
    };
    for (const id of [candidate.maskLayerId, candidate.heightmapLayerId]) {
      const layer = getLayer(record, id);
      if (!layer) continue;
      layer.metadata = {
        ...(layer.metadata || {}), candidateId: candidate.id, candidateSetId: candidateSet.id,
        missionId: mission.id, missionPassId: mission.activePassId || null,
      };
    }
    candidate.summary = candidateSummary(record, candidate);
    candidateSet.candidates.push(candidate);
  }
  mission.candidateSets.push(candidateSet);
  mission.candidateSets = mission.candidateSets.slice(-12);
  mission.pendingDecision = {
    type: "candidate-selection", candidateSetId: candidateSet.id,
    prompt: "Review Clean, Hybrid, and Feature-Preserving candidates and choose one before finalization.",
    candidateIds: candidateSet.candidates.map((item) => item.id), createdAt: now(), resolvedAt: null,
  };
  mission.selectedCandidateId = null;
  mission.stage = REFINEMENT_MISSION_STAGES.REVIEW_REQUIRED;
  mission.updatedAt = now();
  return candidateSet;
}

export async function compareMissionCandidates(record, mission, engine, candidateSetId = null) {
  const set = mission.candidateSets.find((item) => item.id === candidateSetId) || mission.candidateSets.at(-1);
  if (!set) throw new Error("No candidate set is available for comparison.");
  for (const candidate of set.candidates) candidate.summary = candidateSummary(record, candidate);
  const clean = set.candidates.find((item) => item.style === "clean") || set.candidates[0];
  for (const candidate of set.candidates) {
    if (candidate.id === clean?.id) continue;
    const maskComparison = await engine.compareAnalysis(getLayer(record, clean.maskLayerId), getLayer(record, candidate.maskLayerId));
    const heightComparison = await engine.compareAnalysis(getLayer(record, clean.heightmapLayerId), getLayer(record, candidate.heightmapLayerId));
    candidate.comparedToClean = { mask: maskComparison, heightmap: heightComparison };
  }
  set.comparedAt = now();
  set.status = "review-ready";
  return {
    candidateSetId: set.id,
    candidates: set.candidates.map((item) => ({ ...item.summary, comparedToClean: item.comparedToClean || null })),
  };
}

export function selectMissionCandidate(record, mission, candidateId) {
  const set = [...mission.candidateSets].reverse().find((item) => item.candidates.some((candidate) => candidate.id === candidateId));
  const candidate = set?.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`Candidate ${candidateId || "(missing)"} is unavailable.`);
  set.selectedCandidateId = candidate.id;
  mission.selectedCandidateId = candidate.id;
  mission.pendingDecision = mission.pendingDecision ? {
    ...mission.pendingDecision, selectedCandidateId: candidate.id, resolvedAt: now(),
  } : null;
  const planPaused = !!record.assets?.eveBridge?.pendingExecution;
  mission.stage = planPaused ? REFINEMENT_MISSION_STAGES.EVE_PLAN_READY : REFINEMENT_MISSION_STAGES.NEXT_INPUT_READY;
  mission.updatedAt = now();
  return candidate;
}

export function selectedMissionCandidate(mission) {
  if (!mission?.selectedCandidateId) return null;
  for (const set of [...mission.candidateSets].reverse()) {
    const candidate = set.candidates.find((item) => item.id === mission.selectedCandidateId);
    if (candidate) return candidate;
  }
  return null;
}

export function promoteMissionCandidate(record, mission, candidateId, { promoteVisualLayerId = null } = {}) {
  const candidate = candidateId ? selectMissionCandidate(record, mission, candidateId) : selectedMissionCandidate(mission);
  if (!candidate) throw new Error("Select a candidate before promotion.");
  markLayerCanonical(record, candidate.maskLayerId);
  markLayerCanonical(record, candidate.heightmapLayerId);
  if (promoteVisualLayerId) markLayerCanonical(record, promoteVisualLayerId);
  mission.baseline = {
    visualLayerId: promoteVisualLayerId || mission.baseline.visualLayerId || null,
    maskLayerId: candidate.maskLayerId,
    heightmapLayerId: candidate.heightmapLayerId,
  };
  candidate.status = "accepted";
  const pass = activeMissionPass(mission) || createMissionPass(record, mission, { candidateSetId: candidate.candidateSetId });
  pass.selectedCandidateId = candidate.id;
  pass.acceptedLayerIds = [candidate.maskLayerId, candidate.heightmapLayerId, promoteVisualLayerId].filter(Boolean);
  pass.status = "accepted";
  pass.updatedAt = now();
  createMissionCheckpoint(record, mission, `${candidate.label} candidate accepted`, { candidateId: candidate.id });
  mission.stage = REFINEMENT_MISSION_STAGES.NEXT_INPUT_READY;
  mission.updatedAt = now();
  return candidate;
}
