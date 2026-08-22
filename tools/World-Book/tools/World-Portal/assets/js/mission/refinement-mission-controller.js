import { WORLD_PORTAL_STATE_EVENT, emitWorldStateChange } from "../world/world-events.js";
import { ensureLayerAssets, getLayer } from "../world/world-layer-store.js";
import {
  accuracyProfile, activeMissionPass, createMissionCheckpoint, createMissionPass,
  createRefinementMission, ensureMissionAssets, getActiveRefinementMission,
  missionStageLabel, nextMissionAction, REFINEMENT_MISSION_STAGES,
  restorePreviousAcceptedCheckpoint, syncMissionBaseline, updateMission,
} from "./refinement-mission-store.js";
import {
  buildMissionComparison, chooseRunLayers, comparisonSummary, groupOrogenResultFiles,
  missionRelevantLayers,
} from "./orogen-mission-intake.js";
import { createRefinementMissionView } from "./refinement-mission-view.js";
import { selectedMissionCandidate } from "./mission-candidates.js";

function metric(label, value, detail = "") {
  const item = document.createElement("div"); item.className = "mission-metric";
  const title = document.createElement("span"); title.textContent = label;
  const strong = document.createElement("strong"); strong.textContent = value;
  const small = document.createElement("small"); small.textContent = detail;
  item.append(title, strong, small); return item;
}
function layerLabel(record, id) {
  const layer = getLayer(record, id);
  return layer ? `${layer.name} · ${layer.width || "?"} × ${layer.height || "?"}` : "Not selected";
}
function selectedEvidenceIds(record, mission) {
  const assets = ensureLayerAssets(record);
  const sessions = new Set(mission.importedSessionIds || []);
  return missionRelevantLayers(record, mission, assets.layers.filter((layer) => sessions.has(layer.sessionId))).map((layer) => layer.id);
}

export function createRefinementMissionMode({
  portal, sceneApi, autosave, heightmapForge, orogenLab, eveGuided, missionOrchestrator,
}) {
  const view = createRefinementMissionView();
  const openButton = document.getElementById("openRefinementMission");
  const sidebarSummary = document.getElementById("refinementMissionSummary");
  let busy = false;
  const record = () => portal.getActiveRecord();
  const mission = () => getActiveRefinementMission(record());

  function setStatus(message, error = false) {
    view.status.textContent = message; view.status.classList.toggle("is-error", error);
  }
  function setBusy(value) {
    busy = !!value;
    view.overlay.querySelectorAll("button,input,select").forEach((control) => {
      if (!control.classList.contains("mission-close")) control.disabled = busy;
    });
  }
  async function run(label, task) {
    if (busy) return null;
    setBusy(true); setStatus(label);
    try { return await task(); }
    catch (error) { console.error(error); setStatus(error?.message || String(error), true); return null; }
    finally { setBusy(false); refresh(); }
  }

  function refreshTimeline(active) {
    view.timeline.replaceChildren();
    const passes = active?.passes || [];
    if (!passes.length) {
      const item = document.createElement("li"); item.textContent = "No mission passes yet."; view.timeline.append(item); return;
    }
    for (const pass of passes) {
      const item = document.createElement("li");
      const title = document.createElement("strong"); title.textContent = `${pass.name} · ${pass.status}`;
      const detail = document.createElement("small");
      detail.textContent = [
        pass.export ? "baseline exported" : null,
        pass.importedSessionIds?.length ? `${pass.importedSessionIds.length} Orogen run${pass.importedSessionIds.length === 1 ? "" : "s"}` : null,
        pass.eveContext ? "Eve context prepared" : null,
        pass.evePlan ? "Eve plan recorded" : null,
      ].filter(Boolean).join(" · ") || "Baseline checkpoint";
      item.append(title, detail); view.timeline.append(item);
    }
  }

  function candidateById(active, candidateId = view.candidateSelect.value) {
    for (const set of [...(active?.candidateSets || [])].reverse()) {
      const candidate = set.candidates.find((item) => item.id === candidateId);
      if (candidate) return candidate;
    }
    return null;
  }

  function candidateText(candidate) {
    if (!candidate) return "Generate candidates through an Eve plan or Evidence Assimilation.";
    const summary = candidate.summary || {};
    return [
      `${candidate.label} · ${candidate.status}`,
      `Mask: ${candidate.maskLayerId}`,
      `Heightmap: ${candidate.heightmapLayerId}`,
      `Land pixels: ${Number(summary.landPixels || 0).toLocaleString()} · components: ${summary.componentCount || 0}`,
      `Recovered coastline: ${Number(summary.recoveredCoastlinePixels || 0).toLocaleString()} px`,
      `Companion islands: ${summary.preservedCompanionIslands || 0} · remote components rejected: ${summary.rejectedRemoteComponents || 0}`,
      `Elevation: ${summary.minimumElevation || 0}–${summary.maximumElevation || 0} · support ${summary.supportAgreement ? "matched" : "review required"}`,
      `Orogen readiness: ${summary.orogenReady ? "ready" : "review required"}`,
    ].join("\n");
  }

  function refreshCandidates(active) {
    const set = active?.candidateSets?.at(-1) || null;
    const candidates = set?.candidates || [];
    const prior = view.candidateSelect.value;
    view.candidateSelect.replaceChildren(...candidates.map((candidate) => {
      const item = document.createElement("option");
      item.value = candidate.id; item.textContent = `${candidate.label}${candidate.id === active?.selectedCandidateId ? " · selected" : ""}`;
      return item;
    }));
    if (candidates.some((item) => item.id === prior)) view.candidateSelect.value = prior;
    else if (active?.selectedCandidateId) view.candidateSelect.value = active.selectedCandidateId;
    view.candidateCount.textContent = candidates.length ? `${candidates.length} candidate${candidates.length === 1 ? "" : "s"}` : "No candidates";
    view.candidateSummary.textContent = candidateText(candidateById(active));
    view.previewCandidate.disabled = !candidates.length;
    view.selectCandidate.disabled = !candidates.length;
  }

  function refreshMetrics(active) {
    const assets = ensureLayerAssets(record());
    const comparison = active?.latestComparison;
    const linked = selectedEvidenceIds(record(), active || { importedSessionIds: [], baseline: {} });
    view.evidenceCount.textContent = `${linked.length} linked layer${linked.length === 1 ? "" : "s"}`;
    view.metrics.replaceChildren(
      metric("Canonical mask", layerLabel(record(), active?.baseline?.maskLayerId), active?.baseline?.maskLayerId || "No layer ID"),
      metric("Canonical heightmap", layerLabel(record(), active?.baseline?.heightmapLayerId), active?.baseline?.heightmapLayerId || "No layer ID"),
      metric("Orogen runs", String(active?.importedSessionIds?.length || 0), `${assets.analysisSessions.length} total sessions in world`),
      metric("Mask agreement", comparison?.maskComparison ? `${(comparison.maskComparison.intersectionOverUnion * 100).toFixed(2)}% IoU` : "Not compared", comparison?.maskComparison ? `${(comparison.maskComparison.pixelAgreement * 100).toFixed(2)}% pixel agreement` : "Awaiting returned mask"),
      metric("Height agreement", comparison?.heightComparison ? Number(comparison.heightComparison.correlation || 0).toFixed(4) : "Not compared", comparison?.heightComparison ? `MAE ${Number(comparison.heightComparison.meanAbsoluteError || 0).toFixed(2)}` : "Awaiting returned heightmap"),
      metric("Anomalies retained", String(comparison?.anomalies?.length || 0), "Evidence is not deleted automatically"),
    );
    view.comparison.textContent = comparisonSummary(comparison);
  }

  function refresh() {
    ensureMissionAssets(record());
    const active = mission();
    const action = nextMissionAction(record(), active);
    view.world.textContent = `${portal.getActiveWorld().name} · persistent refinement operator`;
    view.name.textContent = active?.name || `Create a ${portal.getActiveWorld().name} Refinement Mission`;
    view.stage.textContent = active ? missionStageLabel(active.stage) : "Mission not created";
    view.pass.textContent = `Pass ${active?.activePassNumber || 0}`;
    view.primary.textContent = action.label; view.primary.dataset.action = action.id;
    view.nextText.textContent = active
      ? `World Portal is tracking the full loop. Current state: ${missionStageLabel(active.stage)}.`
      : "Create one mission card to track the baseline, returned Orogen files, Eve review, accepted changes, and next input.";
    const profile = accuracyProfile(active?.accuracyProfile || "balanced");
    view.accuracy.value = profile.id; view.accuracyDescription.textContent = `${profile.description} Previews up to ${profile.previewWidth}px.`;
    view.includeFull.checked = active?.includeFullResolution ?? profile.includeFullRecommended;
    view.strictMatching.checked = active?.strictMatching ?? profile.strictDimensionMatch;
    refreshMetrics(active); refreshCandidates(active); refreshTimeline(active);
    if (sidebarSummary) sidebarSummary.textContent = active
      ? `${missionStageLabel(active.stage)} · Pass ${active.activePassNumber || 0} · ${profile.label}`
      : "No active mission · create one guided refinement loop";
  }

  async function createMission() {
    if (portal.getActiveWorld().builtin) throw new Error("Export Earth as a custom world before creating a persistent refinement mission.");
    const created = createRefinementMission(record(), { accuracyProfile: view.accuracy.value });
    created.includeFullResolution = view.includeFull.checked;
    created.strictMatching = view.strictMatching.checked;
    await autosave.flush("Refinement mission created");
    setStatus(`${created.name} created.`);
    return created;
  }

  async function exportBaseline() {
    const active = mission(); if (!active) return createMission();
    syncMissionBaseline(record(), active);
    if (!active.baseline.maskLayerId || !active.baseline.heightmapLayerId) {
      throw new Error("Prepare and promote a canonical mask and heightmap before exporting the mission baseline.");
    }
    let pass = activeMissionPass(active);
    if (!pass || pass.export) pass = createMissionPass(record(), active, { baseline: active.baseline });
    const selected = selectedMissionCandidate(active);
    const exportOptions = selected ? {
      coastFloor: selected.settings?.coastFloor,
    } : {
      maskLayerId: active.baseline.maskLayerId,
      heightmapLayerId: active.baseline.heightmapLayerId,
    };
    const result = await orogenLab.exportInputSet(exportOptions);
    pass.export = result; pass.status = "awaiting-orogen"; pass.updatedAt = new Date().toISOString();
    if (selected) {
      selected.status = "exported";
      pass.selectedCandidateId = selected.id;
      pass.acceptedLayerIds = [result.generatedOutputLayerIds?.maskLayerId, result.generatedOutputLayerIds?.heightmapLayerId].filter(Boolean);
    }
    updateMission(record(), active, { lastExport: result, stage: REFINEMENT_MISSION_STAGES.AWAITING_OROGEN });
    createMissionCheckpoint(record(), active, `Mission Pass ${pass.number} baseline exported`, { export: result });
    await autosave.flush("Mission baseline exported");
    setStatus("Baseline downloaded. Run it through World Orogen, then return all exported images together.");
    return result;
  }

  async function importResults(files) {
    const active = mission(); if (!active) throw new Error("Create a mission before importing Orogen results.");
    if (!files.length) throw new Error("Choose the Orogen result images.");
    const groups = groupOrogenResultFiles(files, { fallbackToken: `pass-${active.activePassNumber || 1}` });
    const profile = accuracyProfile(active.accuracyProfile);
    const pass = activeMissionPass(active) || createMissionPass(record(), active, { baseline: active.baseline });
    const imported = [];
    for (const group of groups) {
      if (active.strictMatching && profile.roleConfidence > group.recognitionConfidence) {
        throw new Error(`Run ${group.token} role confidence is ${(group.recognitionConfidence * 100).toFixed(0)}%, below the ${Math.round(profile.roleConfidence * 100)}% ${profile.label} threshold.`);
      }
      const result = await orogenLab.importSessionFiles(group.files, {
        name: `${record().name} Mission Pass ${pass.number} · Orogen ${group.token}`,
        notes: `Automatically grouped by Refinement Mission Mode. Recognized: ${group.recognizedRoles.join(", ") || "none"}.`,
        missionId: active.id, missionPassId: pass.id,
        inputLayerIds: [active.baseline.maskLayerId, active.baseline.heightmapLayerId].filter(Boolean),
        expectedBaselineId: active.lastExport?.generatedOutputLayerIds?.heightmapLayerId || active.baseline.heightmapLayerId,
        expectedBaseline: active.lastExport ? {
          maskSha256: active.lastExport.files?.mask?.sha256 || null,
          heightmapSha256: active.lastExport.files?.heightmap?.sha256 || null,
          width: active.lastExport.files?.mask?.width || null,
          height: active.lastExport.files?.mask?.height || null,
        } : null,
      });
      if (!result) continue;
      const comparison = await buildMissionComparison({ record: record(), mission: active, session: result.session, engine: orogenLab.engine });
      if (active.strictMatching && profile.strictDimensionMatch && !comparison.dimensionMatch) {
        result.session.status = "needs-review";
        comparison.anomalies.push({ layerId: null, layerName: result.session.name, issue: "Returned dimensions do not match the mission baseline." });
      }
      imported.push({ result, comparison });
      active.importedSessionIds.push(result.session.id); pass.importedSessionIds.push(result.session.id);
    }
    const latest = imported.at(-1);
    if (!latest) throw new Error("No Orogen sessions were imported.");
    active.latestComparison = latest.comparison; pass.comparison = latest.comparison; pass.status = "results-imported";
    active.stage = REFINEMENT_MISSION_STAGES.RESULTS_IMPORTED; active.updatedAt = new Date().toISOString();
    const runLayers = chooseRunLayers(latest.result.layers);
    orogenLab.selectLayers({
      layerAId: active.baseline.maskLayerId,
      layerBId: runLayers.mask?.id,
      coastlineMaskLayerId: active.baseline.maskLayerId,
    });
    await autosave.flush("Mission Orogen results imported");
    setStatus(`${imported.length} Orogen run${imported.length === 1 ? "" : "s"} grouped and compared automatically.`);
    return imported;
  }

  async function askEve() {
    const active = mission(); if (!active?.latestComparison) throw new Error("Import and compare Orogen results first.");
    eveGuided.setAccuracy(active.accuracyProfile);
    const result = await eveGuided.exportContext({
      mission: active, accuracyProfileId: active.accuracyProfile,
      includeFullResolution: active.includeFullResolution,
      selectedLayerIds: selectedEvidenceIds(record(), active),
    });
    if (!result) return null;
    const pass = activeMissionPass(active);
    active.latestContext = { hash: result.manifest.contextHash, exportedAt: result.manifest.exportedAt, profile: result.manifest.accuracyProfile };
    if (pass) { pass.eveContext = active.latestContext; pass.status = "waiting-eve-review"; }
    active.stage = REFINEMENT_MISSION_STAGES.EVE_CONTEXT_READY;
    await autosave.flush("Mission Eve context exported");
    setStatus("Curated mission context exported. Upload it to Eve, then import the returned plan.");
    return result;
  }

  async function applyEvePlan() {
    const active = mission(); if (!active) throw new Error("No active mission.");
    if (!eveGuided.hasValidatedPlan()) { eveGuided.open(); setStatus("Import and validate the Eve plan in Eve Guided Mode."); return null; }
    const result = await eveGuided.applyPlan();
    if (result?.paused) {
      active.stage = REFINEMENT_MISSION_STAGES.REVIEW_REQUIRED;
      await autosave.flush("Mission paused for Eve-directed review");
      setStatus("Eve created review candidates. Choose one, then resume the plan.");
      return active;
    }
    syncMissionBaseline(record(), active);
    active.stage = REFINEMENT_MISSION_STAGES.NEXT_INPUT_READY;
    const pass = activeMissionPass(active); if (pass) pass.status = "eve-plan-applied";
    createMissionCheckpoint(record(), active, "Eve recommendation applied", { baseline: active.baseline });
    await autosave.flush("Mission Eve plan applied");
    return active;
  }

  async function rollback() {
    const active = mission(); if (!active) throw new Error("No active mission.");
    const checkpoint = restorePreviousAcceptedCheckpoint(record(), active);
    const visual = getLayer(record(), checkpoint.canonical.visualLayerId);
    if (visual?.blob) {
      record().surface.textureBlob = visual.blob; record().surface.width = visual.width; record().surface.height = visual.height;
      await sceneApi.setWorldSurface(portal.getActiveSurface());
    }
    await autosave.flush("Mission checkpoint restored");
    emitWorldStateChange("worldAssets", portal.activeWorldId, { reason: "mission-rollback" });
    setStatus(`Returned to checkpoint: ${checkpoint.reason}.`);
  }

  async function primaryAction() {
    const action = view.primary.dataset.action;
    if (action === "create") return run("Creating refinement mission…", createMission);
    if (action === "open-forge") { heightmapForge.open(); return null; }
    if (action === "export-baseline" || action === "build-next") return run("Finalizing mission Orogen input…", exportBaseline);
    if (action === "import-results") { view.files.click(); return null; }
    if (action === "ask-eve") return run("Preparing curated Eve mission context…", askEve);
    if (action === "import-plan") { eveGuided.open(); setStatus("Import the returned Eve plan in Eve Guided Mode."); return null; }
    if (action === "apply-plan") return run("Applying validated Eve recommendation…", applyEvePlan);
    if (action === "confirm") { eveGuided.open(); return null; }
    if (action === "review-candidates") {
      const active = mission();
      const candidate = candidateById(active);
      if (candidate) orogenLab.selectLayers({ layerAId: active.baseline.maskLayerId, layerBId: candidate.maskLayerId, coastlineMaskLayerId: active.baseline.maskLayerId });
      return null;
    }
    return null;
  }

  function previewCandidate() {
    const active = mission(); const candidate = candidateById(active);
    if (!candidate) return;
    orogenLab.open();
    orogenLab.selectLayers({
      layerAId: active.baseline.maskLayerId,
      layerBId: candidate.maskLayerId,
      coastlineMaskLayerId: active.baseline.maskLayerId,
    });
    setStatus(`${candidate.label} opened against the mission baseline mask.`);
  }

  async function selectCandidate() {
    const active = mission(); const candidate = candidateById(active);
    if (!active || !candidate) throw new Error("Choose a generated candidate first.");
    await missionOrchestrator.selectCandidate({ missionId: active.id, candidateId: candidate.id });
    emitWorldStateChange("missionCandidateSelected", portal.activeWorldId, { missionId: active.id, candidateId: candidate.id });
    setStatus(`${candidate.label} selected. Resume the Eve plan to finalize it.`);
    refresh();
    return candidate;
  }

  function open() { view.overlay.hidden = false; refresh(); }
  function close() { view.overlay.hidden = true; }
  view.primary.addEventListener("click", primaryAction);
  view.files.addEventListener("change", () => run("Grouping and analyzing Orogen results…", async () => {
    const files = [...(view.files.files || [])]; view.files.value = ""; return importResults(files);
  }));
  view.accuracy.addEventListener("change", () => {
    const active = mission(); if (!active) return refresh();
    active.accuracyProfile = view.accuracy.value; active.updatedAt = new Date().toISOString();
    autosave.schedule("Mission accuracy changed"); refresh();
  });
  view.includeFull.addEventListener("change", () => { const active = mission(); if (active) { active.includeFullResolution = view.includeFull.checked; autosave.schedule("Mission context scope changed"); } });
  view.strictMatching.addEventListener("change", () => { const active = mission(); if (active) { active.strictMatching = view.strictMatching.checked; autosave.schedule("Mission matching changed"); } });
  view.openForge.addEventListener("click", () => heightmapForge.open());
  view.openLab.addEventListener("click", () => orogenLab.open());
  view.openEve.addEventListener("click", () => eveGuided.open());
  view.returnCheckpoint.addEventListener("click", () => run("Restoring previous accepted pass…", rollback));
  view.candidateSelect.addEventListener("change", () => { view.candidateSummary.textContent = candidateText(candidateById(mission())); });
  view.previewCandidate.addEventListener("click", previewCandidate);
  view.selectCandidate.addEventListener("click", () => run("Selecting mission candidate…", selectCandidate));
  view.close.addEventListener("click", close);
  view.overlay.addEventListener("click", (event) => { if (event.target === view.overlay) close(); });
  openButton?.addEventListener("click", open);

  window.addEventListener(WORLD_PORTAL_STATE_EVENT, (event) => {
    const active = mission(); const key = event.detail?.key;
    if (key === "evePlanReviewed" && active && event.detail?.validation?.valid) {
      active.latestPlan = { title: event.detail.plan?.title || "Eve plan", summary: event.detail.plan?.summary || "", reviewedAt: new Date().toISOString() };
      const pass = activeMissionPass(active); if (pass) pass.evePlan = active.latestPlan;
      active.stage = event.detail.validation.requiresConfirmation
        ? REFINEMENT_MISSION_STAGES.CONFIRMATION_REQUIRED
        : REFINEMENT_MISSION_STAGES.EVE_PLAN_READY;
      autosave.schedule("Mission Eve plan ready");
    }
    if (key === "evePlanPaused" && active) {
      active.stage = REFINEMENT_MISSION_STAGES.REVIEW_REQUIRED;
      active.pendingDecision = event.detail?.result?.pendingDecision || active.pendingDecision;
      autosave.schedule("Mission paused for review");
    }
    if (key === "evePlanApplied" && active) {
      active.latestExecution = event.detail?.execution || null;
      syncMissionBaseline(record(), active);
      const pass = activeMissionPass(active);
      if (pass) {
        pass.evePlan = { ...(active.latestPlan || {}), executionId: active.latestExecution?.id || null };
        pass.acceptedLayerIds = [active.baseline.maskLayerId, active.baseline.heightmapLayerId, active.baseline.visualLayerId].filter(Boolean);
        pass.status = "accepted"; pass.updatedAt = new Date().toISOString();
      }
      active.stage = REFINEMENT_MISSION_STAGES.NEXT_INPUT_READY;
      createMissionCheckpoint(record(), active, "Eve plan accepted", { executionId: active.latestExecution?.id || null });
      autosave.schedule("Mission Eve plan applied");
    }
    if (["activeWorldId", "worldAssets", "worldLibrary", "eveContextExported", "evePlanReviewed", "evePlanPaused", "evePlanApplied", "missionCandidateSelected"].includes(key)) refresh();
  });
  ensureMissionAssets(record()); refresh();
  return { open, close, refresh, createMission, exportBaseline, importResults, askEve, getActiveMission: mission };
}
