import {
  activeMissionPass, accuracyProfile, attachMissionBaseline, createMissionCheckpoint,
  createMissionPass, createRefinementMission, ensureMissionAssets, ensureRefinementMission,
  getActiveRefinementMission, getRefinementMission, nextMissionAction, REFINEMENT_MISSION_STAGES,
  restorePreviousAcceptedCheckpoint, setActiveRefinementMission, syncMissionBaseline, updateMission,
} from "./refinement-mission-store.js";
import { inspectMissionPrerequisites, applyMissionPrerequisiteRepair } from "./mission-prerequisites.js";
import {
  buildMissionCandidates, compareMissionCandidates, promoteMissionCandidate,
  selectMissionCandidate, selectedMissionCandidate,
} from "./mission-candidates.js";
import { ensureLayerAssets, getLayer } from "../world/world-layer-store.js";
import { resolveRefinementIntent } from "../refinement/refinement-intent.js";

function now() { return new Date().toISOString(); }
function uniqueId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

function requireMission(record, missionId = null) {
  const mission = missionId ? getRefinementMission(record, missionId) : getActiveRefinementMission(record);
  if (!mission) throw new Error("No active refinement mission is available.");
  return mission;
}

function sessionById(record, sessionId) {
  return ensureLayerAssets(record).analysisSessions.find((session) => session.id === sessionId) || null;
}

function evidenceFromSession(record, sessionId) {
  const session = sessionById(record, sessionId);
  const layers = session ? session.outputLayerIds.map((id) => getLayer(record, id)).filter(Boolean) : [];
  return {
    session,
    maskLayerIds: layers.filter((layer) => layer.type === "orogen-land-mask").map((layer) => layer.id),
    heightmapLayerIds: layers.filter((layer) => layer.type === "orogen-land-heightmap").map((layer) => layer.id),
    visualLayerIds: layers.filter((layer) => ["satellite", "terrain", "visual-map"].includes(layer.type)).map((layer) => layer.id),
    climateLayerIds: layers.filter((layer) => ["climate", "biome", "classified-regions"].includes(layer.type)).map((layer) => layer.id),
  };
}

export function createMissionOrchestrator({ portal, autosave, orogenLab, heightmapForge, sceneApi }) {
  const record = () => portal.getActiveRecord();
  const mission = (id = null) => requireMission(record(), id);

  async function persist(reason) {
    await autosave.flush(reason);
    return true;
  }

  async function ensure(options = {}) {
    if (portal.getActiveWorld().builtin && options.allowBuiltin !== true) {
      throw new Error("Export the built-in Earth as a custom world before creating a persistent refinement mission.");
    }
    const result = ensureRefinementMission(record(), {
      idempotencyKey: options.idempotencyKey || options.planId || null,
      name: options.name,
      missionType: options.missionType,
      scope: options.scope,
      accuracyProfile: options.accuracyProfile,
      baseline: options.baseline,
    });
    if (options.baseline) attachMissionBaseline(record(), result.mission, options.baseline);
    await persist(result.created ? "Refinement mission created by Eve plan" : "Refinement mission recovered by Eve plan");
    return {
      missionId: result.mission.id,
      activePassId: result.mission.activePassId,
      created: result.created,
      currentStage: result.mission.stage,
      nextAction: nextMissionAction(record(), result.mission),
    };
  }

  async function create(options = {}) {
    const created = createRefinementMission(record(), options);
    await persist("Refinement mission created");
    return { missionId: created.id, activePassId: created.activePassId, created: true, currentStage: created.stage };
  }

  async function attachBaseline(options = {}) {
    const active = mission(options.missionId);
    const baseline = attachMissionBaseline(record(), active, {
      visualLayerId: options.visualLayerId ?? options.baselineVisualLayerId,
      maskLayerId: options.maskLayerId ?? options.baselineMaskLayerId,
      heightmapLayerId: options.heightmapLayerId ?? options.baselineHeightmapLayerId,
    });
    createMissionCheckpoint(record(), active, "Mission baseline attached through Eve plan", { baseline });
    await persist("Mission baseline attached");
    return { missionId: active.id, baseline };
  }

  async function setActive(options = {}) {
    const active = setActiveRefinementMission(record(), options.missionId);
    await persist("Active mission changed");
    return { missionId: active.id, currentStage: active.stage };
  }

  async function setAccuracy(options = {}) {
    const active = mission(options.missionId);
    active.accuracyProfile = accuracyProfile(options.accuracyProfile || options.profile).id;
    active.updatedAt = now();
    await persist("Mission accuracy profile changed");
    return { missionId: active.id, accuracyProfile: active.accuracyProfile };
  }

  async function startPass(options = {}) {
    const active = mission(options.missionId);
    syncMissionBaseline(record(), active, { preserve: true });
    const pass = createMissionPass(record(), active, {
      name: options.name,
      baseline: options.baseline || active.baseline,
      status: options.status || "baseline-prepared",
      notes: options.notes,
    });
    await persist("Mission pass started");
    return { missionId: active.id, passId: pass.id, passNumber: pass.number };
  }

  async function attachOrogenSession(options = {}) {
    const active = mission(options.missionId);
    const session = sessionById(record(), options.sessionId);
    if (!session) throw new Error(`Orogen session ${options.sessionId || "(missing)"} is unavailable.`);
    if (!active.importedSessionIds.includes(session.id)) active.importedSessionIds.push(session.id);
    session.missionId = active.id;
    session.missionPassId = active.activePassId || null;
    const pass = activeMissionPass(active);
    if (pass && !pass.importedSessionIds.includes(session.id)) pass.importedSessionIds.push(session.id);
    active.stage = REFINEMENT_MISSION_STAGES.RESULTS_IMPORTED;
    active.updatedAt = now();
    await persist("Orogen session attached to mission");
    return { missionId: active.id, sessionId: session.id, passId: active.activePassId || null };
  }

  async function setStage(options = {}) {
    const active = mission(options.missionId);
    if (!Object.values(REFINEMENT_MISSION_STAGES).includes(options.stage)) throw new Error(`Unknown mission stage ${options.stage}.`);
    updateMission(record(), active, { stage: options.stage });
    await persist("Mission stage changed");
    return { missionId: active.id, currentStage: active.stage };
  }

  async function advance(options = {}) {
    const active = mission(options.missionId);
    const order = [
      REFINEMENT_MISSION_STAGES.BASELINE_REQUIRED, REFINEMENT_MISSION_STAGES.BASELINE_READY,
      REFINEMENT_MISSION_STAGES.AWAITING_OROGEN, REFINEMENT_MISSION_STAGES.RESULTS_IMPORTED,
      REFINEMENT_MISSION_STAGES.EVE_CONTEXT_READY, REFINEMENT_MISSION_STAGES.EVE_PLAN_READY,
      REFINEMENT_MISSION_STAGES.REVIEW_REQUIRED, REFINEMENT_MISSION_STAGES.NEXT_INPUT_READY,
      REFINEMENT_MISSION_STAGES.COMPLETE,
    ];
    const index = order.indexOf(active.stage);
    active.stage = options.stage || order[Math.min(order.length - 1, Math.max(0, index + 1))];
    active.updatedAt = now();
    await persist("Mission advanced");
    return { missionId: active.id, currentStage: active.stage };
  }

  async function saveCheckpoint(options = {}) {
    const active = mission(options.missionId);
    const checkpoint = createMissionCheckpoint(record(), active, options.reason || "Eve mission checkpoint", options.extra || {});
    await persist("Mission checkpoint saved");
    return { missionId: active.id, checkpointId: checkpoint.id };
  }

  async function rollback(options = {}) {
    const active = mission(options.missionId);
    const checkpoint = restorePreviousAcceptedCheckpoint(record(), active);
    const visual = getLayer(record(), checkpoint.canonical.visualLayerId);
    if (visual?.blob && sceneApi) {
      record().surface.textureBlob = visual.blob;
      record().surface.width = visual.width;
      record().surface.height = visual.height;
      await sceneApi.setWorldSurface(portal.getActiveSurface());
    }
    await persist("Mission rolled back to previous accepted pass");
    return { missionId: active.id, checkpointId: checkpoint.id, baseline: active.baseline };
  }

  async function completePass(options = {}) {
    const active = mission(options.missionId);
    const pass = activeMissionPass(active);
    if (!pass) throw new Error("No active mission pass is available.");
    pass.status = options.status || "complete";
    pass.updatedAt = now();
    active.stage = REFINEMENT_MISSION_STAGES.COMPLETE;
    createMissionCheckpoint(record(), active, options.reason || `Mission Pass ${pass.number} completed`);
    await persist("Mission pass completed");
    return { missionId: active.id, passId: pass.id, status: pass.status };
  }

  async function repairPrerequisites(options = {}) {
    const active = options.missionId ? mission(options.missionId) : getActiveRefinementMission(record());
    const inspection = inspectMissionPrerequisites(record(), active);
    if (!options.apply) return { ...inspection, confirmationRequired: inspection.issues.length > 0 };
    const repaired = applyMissionPrerequisiteRepair(record(), active, inspection);
    const visual = getLayer(record(), repaired.current?.visualLayerId);
    if (visual?.blob instanceof Blob && sceneApi) {
      record().surface.textureBlob = visual.blob;
      record().surface.textureName = visual.filename || visual.name;
      record().surface.width = visual.width;
      record().surface.height = visual.height;
      await sceneApi.setWorldSurface(portal.getActiveSurface());
    }
    if (active) createMissionCheckpoint(record(), active, "Mission prerequisites repaired", { issues: inspection.issues });
    await persist("Mission prerequisites repaired");
    return repaired;
  }

  async function buildCandidates(options = {}) {
    const active = mission(options.missionId);
    const evidence = options.sessionId ? evidenceFromSession(record(), options.sessionId) : {
      maskLayerIds: options.maskEvidenceLayerIds || [],
      heightmapLayerIds: options.heightEvidenceLayerIds || [],
      visualLayerIds: [], climateLayerIds: [], session: null,
    };
    const set = await buildMissionCandidates({
      record: record(), mission: active, commands: orogenLab.commands,
      styles: options.styles,
      inputs: {
        canonicalMaskLayerId: options.canonicalMaskLayerId || active.baseline.maskLayerId,
        canonicalHeightmapLayerId: options.canonicalHeightmapLayerId || active.baseline.heightmapLayerId,
        maskEvidenceLayerIds: options.maskEvidenceLayerIds || evidence.maskLayerIds,
        maskEvidenceWeights: options.maskEvidenceWeights || [],
        heightEvidenceLayerIds: options.heightEvidenceLayerIds || evidence.heightmapLayerIds,
        heightEvidenceWeights: options.heightEvidenceWeights || [],
        sessionId: options.sessionId || evidence.session?.id || null,
      },
      intent: options.intent || options,
    });
    const comparison = await compareMissionCandidates(record(), active, orogenLab.engine, set.id);
    active.resumeToken = uniqueId("mission-resume");
    await persist("Mission review candidates generated");
    return {
      missionId: active.id, candidateSetId: set.id,
      candidateIds: set.candidates.map((item) => item.id),
      candidateMaskLayerIds: set.candidates.map((item) => item.maskLayerId),
      candidateHeightmapLayerIds: set.candidates.map((item) => item.heightmapLayerId),
      comparison, pauseForReview: true, resumeToken: active.resumeToken,
      pendingDecision: active.pendingDecision,
    };
  }

  async function compareCandidates(options = {}) {
    const active = mission(options.missionId);
    const comparison = await compareMissionCandidates(record(), active, orogenLab.engine, options.candidateSetId);
    await persist("Mission candidates compared");
    return comparison;
  }

  async function selectCandidate(options = {}) {
    const active = mission(options.missionId);
    const selected = selectMissionCandidate(record(), active, options.candidateId);
    await persist("Mission candidate selected");
    return {
      missionId: active.id, selectedCandidateId: selected.id,
      selectedMaskLayerId: selected.maskLayerId, selectedHeightmapLayerId: selected.heightmapLayerId,
    };
  }

  async function promoteCandidate(options = {}) {
    const active = mission(options.missionId);
    const selected = promoteMissionCandidate(record(), active, options.candidateId, { promoteVisualLayerId: options.visualLayerId });
    await persist("Mission candidate promoted");
    return {
      missionId: active.id, selectedCandidateId: selected.id,
      canonicalMaskLayerId: selected.maskLayerId, canonicalHeightmapLayerId: selected.heightmapLayerId,
    };
  }

  async function prepareNextOrogenInput(options = {}) {
    const ensured = options.missionId
      ? { mission: mission(options.missionId), created: false }
      : ensureRefinementMission(record(), {
        idempotencyKey: options.idempotencyKey || options.planId || null,
        missionType: options.missionType, scope: options.scope,
        accuracyProfile: options.accuracyProfile, baseline: options.baseline,
      });
    const active = ensured.mission;
    const inspection = inspectMissionPrerequisites(record(), active);
    if (!inspection.valid && !options.repairPrerequisites) {
      return { missionId: active.id, pauseForReview: true, pendingDecision: { type: "prerequisite-repair", issues: inspection.issues }, prerequisites: inspection };
    }
    if (!inspection.valid && options.repairPrerequisites) applyMissionPrerequisiteRepair(record(), active, inspection);
    syncMissionBaseline(record(), active, { preserve: true });
    const existing = selectedMissionCandidate(active);
    if (!existing) {
      const latestSet = active.candidateSets.at(-1);
      if (!latestSet || options.regenerateCandidates) return buildCandidates({ ...options, missionId: active.id });
      active.pendingDecision = active.pendingDecision || {
        type: "candidate-selection", candidateSetId: latestSet.id,
        candidateIds: latestSet.candidates.map((item) => item.id), createdAt: now(), resolvedAt: null,
      };
      active.stage = REFINEMENT_MISSION_STAGES.REVIEW_REQUIRED;
      await persist("Mission paused for candidate selection");
      return { missionId: active.id, candidateSetId: latestSet.id, pauseForReview: true, resumeToken: active.resumeToken, pendingDecision: active.pendingDecision };
    }
    const intent = resolveRefinementIntent(options.intent || options);
    if (options.dryRun) {
      return {
        missionId: active.id, dryRun: true, selectedCandidateId: existing.id,
        selectedMaskLayerId: existing.maskLayerId, selectedHeightmapLayerId: existing.heightmapLayerId,
        resolvedIntent: intent,
      };
    }
    const final = await orogenLab.finalizeInput({
      maskLayerId: existing.maskLayerId,
      heightmapLayerId: existing.heightmapLayerId,
      outputWidth: options.outputWidth,
      outputHeight: options.outputHeight,
      coastFloor: options.coastFloor ?? intent.settings.coastFloor,
      strictBinaryMask: true,
      requireMatchingLandSupport: true,
    });
    const pass = activeMissionPass(active) || createMissionPass(record(), active, { status: "candidate-selected" });
    pass.candidateSetId = active.candidateSets.at(-1)?.id || null;
    pass.selectedCandidateId = existing.id;
    pass.acceptedLayerIds = [final.finalMaskLayerId, final.finalHeightmapLayerId];
    pass.status = options.export === false ? "finalized" : "exported";
    active.stage = REFINEMENT_MISSION_STAGES.NEXT_INPUT_READY;
    active.pendingDecision = null;
    active.resumeToken = null;
    createMissionCheckpoint(record(), active, `${existing.label} candidate finalized`, { final });
    let exported = null;
    if (options.export !== false) {
      exported = await orogenLab.exportInputSet({
        maskLayerId: final.finalMaskLayerId,
        heightmapLayerId: final.finalHeightmapLayerId,
        outputWidth: final.width,
        outputHeight: final.height,
        coastFloor: final.settings.coastFloor,
        strictBinaryMask: true,
        requireMatchingLandSupport: true,
      });
      active.lastExport = exported;
      active.stage = REFINEMENT_MISSION_STAGES.AWAITING_OROGEN;
    }
    await persist("Mission next Orogen input prepared");
    return {
      missionId: active.id, passId: pass.id, selectedCandidateId: existing.id,
      finalMaskLayerId: final.finalMaskLayerId, finalHeightmapLayerId: final.finalHeightmapLayerId,
      exportManifestId: exported?.generatedOutputLayerIds?.heightmapLayerId || null,
      exported, validation: final.validation,
    };
  }

  return {
    ensure, create, attachBaseline, setActive, setAccuracy, startPass,
    attachOrogenSession, setStage, advance, saveCheckpoint, rollback, completePass,
    repairPrerequisites, buildCandidates, compareCandidates, selectCandidate,
    promoteCandidate, prepareNextOrogenInput,
    getActiveMission: () => getActiveRefinementMission(record()),
    inspectPrerequisites: () => inspectMissionPrerequisites(record(), getActiveRefinementMission(record())),
  };
}
