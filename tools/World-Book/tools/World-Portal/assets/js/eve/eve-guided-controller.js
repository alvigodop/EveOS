import { WORLD_PORTAL_STATE_EVENT, emitWorldStateChange } from "../world/world-events.js";
import { ensureLayerAssets, getLayer } from "../world/world-layer-store.js";
import { downloadBlob, slugify } from "../refinement/image-layer-utils.js";
import { createEveContextBundle } from "./eve-context-exporter.js";
import { validateEvePlan } from "./eve-plan-validator.js";
import { createEveGuidedView } from "./eve-guided-view.js";
import { resolvePlanValue } from "./eve-plan-results.js";
import { buildBridgeState } from "./eve-bridge-summary.js";
import { accuracyProfile, getActiveRefinementMission } from "../mission/refinement-mission-store.js";
import { createEveCommandDispatcher } from "./eve-command-dispatcher.js";
import { createAgentSkillController } from "../agent-skill/agent-skill-controller.js";

function readJsonFile(file) { return file.text().then((text) => JSON.parse(text)); }
function now() { return new Date().toISOString(); }

function commandLayerNames(command, record) {
  const ids = new Set();
  function visit(value, key = "") {
    if (Array.isArray(value)) {
      if (/layerids$/i.test(key)) value.filter((item) => typeof item === "string").forEach((id) => ids.add(id));
      else value.forEach((item) => visit(item, key));
    } else if (value && typeof value === "object") Object.entries(value).forEach(([child, item]) => visit(item, child));
    else if (typeof value === "string" && /layerid$/i.test(key) && !value.startsWith("$result.")) ids.add(value);
  }
  visit({ inputs: command.inputs, parameters: command.parameters });
  return [...ids].map((id) => getLayer(record, id)?.name || id);
}

function commandSummary(command, record) {
  const confirmation = command.confirmation === "required" ? " · confirmation required" : "";
  const layers = commandLayerNames(command, record);
  return [
    `${command.id || "unnamed"}: ${command.capability}${confirmation}`,
    `  ${command.reason || "No reason supplied."}`,
    ...(layers.length ? [`  Layers: ${layers.join(" · ")}`] : []),
  ].join("\n");
}

function planReviewText(plan, validation, record) {
  const lines = [
    plan?.title || "Untitled Agent plan", plan?.summary || "No plain-language summary supplied.", "",
    `World: ${plan?.worldId || "missing"}`, `Risk: ${validation.riskLevel}`,
    `Commands: ${validation.commandCount}`, `Validation: ${validation.valid ? "valid" : "rejected"}`,
  ];
  if (validation.selectorResolutions?.length) {
    lines.push("", "Semantic selectors resolved:", ...validation.selectorResolutions.map((item) => (
      `- ${item.selector.semantic || item.selector.role}: ${item.labels.join(" · ")} (${item.ids.join(", ")})`
    )));
  }
  if (validation.warnings.length) lines.push("", "Warnings:", ...validation.warnings.map((warning) => `- ${warning}`));
  if (validation.errors.length) lines.push("", "Errors:", ...validation.errors.map((error) => `- ${error}`));
  if (validation.resolvedPlan?.commands?.length) {
    const commands = validation.resolvedPlan.commands;
    const canonical = commands.filter((command) => /promote|setCanonical|repairPrerequisites|returnToPrevious/.test(command.capability)).length;
    const generated = commands.filter((command) => /regenerate|merge|consensus|fuse|synthesize|Candidates|prepareNext|finalize/.test(command.capability)).length;
    lines.push("", `Plan effects: ${generated} generated/orchestrated operations · ${canonical} protected decisions`);
    lines.push("", "Commands:", ...commands.map((command) => commandSummary(command, record)));
  }
  return lines.join("\n");
}

function pendingExecution(record) { return ensureLayerAssets(record).eveBridge?.pendingExecution || null; }
function restoreResults(entries = []) { return new Map(entries); }

export function createEveGuidedMode({
  portal, state, autosave, heightmapForge, orogenLab, missionOrchestrator, sceneApi,
}) {
  const view = createEveGuidedView();
  const openButton = document.getElementById("openEveGuided");
  const summary = document.getElementById("eveGuidedSummary");
  const dispatcher = createEveCommandDispatcher({ portal, autosave, heightmapForge, orogenLab, missionOrchestrator, sceneApi });
  let contextHash = null;
  let pendingPlan = null;
  let validation = null;
  let busy = false;
  const record = () => portal.getActiveRecord();

  function setStatus(message, error = false) {
    view.status.textContent = message;
    view.status.classList.toggle("is-error", error);
  }

  function syncApplyButton() {
    const paused = pendingExecution(record());
    view.applyPlan.textContent = paused ? "Resume Agent plan" : "Apply validated plan";
    view.applyPlan.disabled = busy || (!paused && !validation?.valid);
  }

  function setBusy(value) {
    busy = !!value;
    for (const control of [view.exportContext, view.reviewPlan, view.buildInput]) control.disabled = busy;
    syncApplyButton();
  }

  function updateSummary() {
    const assets = ensureLayerAssets(record());
    const bridge = assets.eveBridge || {};
    const paused = bridge.pendingExecution;
    if (summary) summary.textContent = `${assets.layers.length} layers · ${bridge.executions?.length || 0} executions · ${paused ? "plan paused for review" : contextHash ? "context ready" : "context not exported"}`;
    view.world.textContent = `${portal.getActiveWorld().name} · ${assets.layers.length} layers · ${assets.analysisSessions.length} sessions`;
    if (paused) {
      view.review.textContent = [
        buildBridgeState(record(), { contextHash, pendingPlan, validation }), "",
        `Paused Agent plan: ${paused.plan?.title || "Untitled"}`,
        `Pending decision: ${paused.pendingDecision?.prompt || paused.pendingDecision?.type || "Review required"}`,
        `Completed commands: ${paused.results?.length || 0} · resume at command ${paused.commandIndex + 1}`,
      ].join("\n");
      setStatus("Plan paused safely. Review the candidates or prerequisite repair, then resume.");
    } else if (!pendingPlan) view.review.textContent = buildBridgeState(record(), { contextHash });
    syncApplyButton();
  }

  function syncAccuracyDescription() {
    const profile = accuracyProfile(view.accuracy.value);
    view.accuracyDescription.textContent = `${profile.description} Previews up to ${profile.previewWidth}px.`;
    if (profile.includeFullRecommended) view.includeFull.checked = true;
  }

  async function exportContext(options = {}) {
    if (busy) return null;
    setBusy(true); setStatus("Building curated mission context…");
    try {
      const mission = options.mission || getActiveRefinementMission(record());
      const result = await createEveContextBundle({
        record: record(), state, engine: orogenLab.engine,
        toolState: { heightmapForge: heightmapForge.getSettings(), refinement: orogenLab.getContextState() },
        includeFullResolution: options.includeFullResolution ?? view.includeFull.checked,
        includeAgentSkill: options.forceAgentSkill || view.includeAgentSkill?.checked !== false,
        accuracyProfileId: options.accuracyProfileId || view.accuracy.value,
        mission, selectedLayerIds: options.selectedLayerIds || [],
        onProgress(fraction, message) { setStatus(`${message} · ${Math.round(fraction * 100)}%`); },
      });
      contextHash = result.manifest.contextHash;
      const assets = ensureLayerAssets(record());
      assets.eveBridge = {
        ...(assets.eveBridge || {}), protocolVersion: 1, agentProtocolVersion: 1, lastContextHash: contextHash,
        lastContextExportedAt: result.manifest.exportedAt, executions: assets.eveBridge?.executions || [],
        lastContextProfile: {
          accuracyProfile: result.manifest.accuracyProfile, previewCount: result.manifest.previewCount,
          fullAssetCount: result.manifest.fullAssetCount, curatedLayerCount: result.manifest.curatedLayerCount,
          reportCount: result.manifest.reportCount,
          agentSkillIncluded: !!result.manifest.agentSkill?.included, agentSkillVersion: result.manifest.agentSkill?.skillVersion || null,
        },
      };
      await autosave.flush("Agent context exported");
      downloadBlob(result.blob, `${slugify(record().name)}.world-portal-context.zip`);
      view.review.textContent = [
        "World Portal agent context exported.", `Context hash: ${contextHash}`, `ZIP entries: ${result.entries}`,
        `Accuracy profile: ${result.manifest.accuracyProfile}`,
        `Curated layers: ${result.manifest.curatedLayerCount} · previews: ${result.manifest.previewCount}`,
        `Mission creation available: ${result.manifest.missionControl?.canCreateMission ? "yes" : "no"}`,
        `Portable Agent Skill: ${result.manifest.agentSkill?.included ? `included · v${result.manifest.agentSkill.skillVersion}` : "not included"}`,
        "Upload the ZIP to any capable agent. Start with eve-briefing.json and agent-skill/SKILL.md; the agent can then create missions, resolve semantic layers, tune existing engines, and author a declarative plan.",
      ].join("\n");
      setStatus("Agent-ready World Portal context ZIP downloaded.");
      emitWorldStateChange("eveContextExported", portal.activeWorldId, { contextHash, manifest: result.manifest });
      updateSummary();
      return result;
    } catch (error) { console.error(error); setStatus(error?.message || String(error), true); return null; }
    finally { setBusy(false); }
  }

  async function reviewPlanFile(file) {
    if (!file) return setStatus("Choose an Agent plan JSON file first.", true);
    try {
      pendingPlan = await readJsonFile(file);
      validation = validateEvePlan(pendingPlan, { record: record(), contextHash });
      view.review.textContent = planReviewText(pendingPlan, validation, record());
      setStatus(validation.valid ? "Plan validated. Review resolved selectors and protected actions before applying." : "Plan rejected by validation.", !validation.valid);
      emitWorldStateChange("evePlanReviewed", portal.activeWorldId, { plan: pendingPlan, validation });
    } catch (error) {
      pendingPlan = null; validation = null;
      setStatus(`Plan could not be read: ${error?.message || error}`, true);
    }
    syncApplyButton();
  }
  function reviewPlan() { return reviewPlanFile(view.planFile.files?.[0]); }

  async function storeExecution(execution, reason) {
    const assets = ensureLayerAssets(record());
    assets.eveBridge = { ...(assets.eveBridge || {}), executions: [...(assets.eveBridge?.executions || []), execution].slice(-30) };
    await autosave.flush(reason);
  }

  async function savePause({ plan, index, results, execution, result }) {
    const assets = ensureLayerAssets(record());
    const rerunCurrent = plan.commands[index].capability === "mission.prepareNextOrogenInput";
    assets.eveBridge.pendingExecution = {
      plan, commandIndex: rerunCurrent ? index : index + 1, results: [...results.entries()],
      execution, resumeToken: result.resumeToken || null, pendingDecision: result.pendingDecision || null,
      pausedAt: now(), contextHash,
    };
    execution.status = "paused";
    execution.pausedAt = now();
    await autosave.flush("Agent plan paused for review");
    emitWorldStateChange("evePlanPaused", portal.activeWorldId, { execution, result });
  }

  async function applyPlan() {
    if (busy) return;
    const paused = pendingExecution(record());
    const plan = paused?.plan || validation?.resolvedPlan;
    if (!plan || (!paused && !validation?.valid)) return;
    if (!paused && validation.warnings.length && !window.confirm("This plan has validation warnings. Apply compatible steps anyway?")) return;
    if (!paused && validation.requiresConfirmation && !window.confirm("This plan contains protected canonical or rollback actions. Continue to step-by-step confirmation?")) return;
    setBusy(true);
    const results = paused ? restoreResults(paused.results) : new Map();
    const execution = paused?.execution || {
      id: `eve-execution-${Date.now().toString(36)}`, startedAt: now(),
      planTitle: plan.title || "Agent plan", steps: [],
    };
    let startIndex = paused?.commandIndex || 0;
    try {
      for (let index = startIndex; index < plan.commands.length; index += 1) {
        const command = plan.commands[index];
        setStatus(`Applying ${command.id}…`);
        try {
          if (command.confirmation === "required" && !window.confirm(`${command.reason || command.capability}\n\nApply this protected step?`)) throw new Error("Protected step cancelled by user.");
          const inputs = resolvePlanValue(command.inputs || {}, results);
          const parameters = resolvePlanValue(command.parameters || {}, results);
          const result = await dispatcher.execute(command.capability, inputs, parameters, { ...command, planId: plan.id || plan.title });
          results.set(command.id, result ?? {});
          execution.steps.push({ commandId: command.id, capability: command.capability, status: result?.pauseForReview ? "paused" : "completed", result: result ?? null });
          if (result?.pauseForReview) {
            await savePause({ plan, index, results, execution, result });
            view.review.textContent += `\n\nExecution ${execution.id} paused: ${result.pendingDecision?.prompt || result.pendingDecision?.type || "review required"}.`;
            setStatus("Agent plan paused for visual review. Select a candidate in Refinement Mission, then resume.");
            updateSummary();
            return { paused: true, result, execution };
          }
        } catch (error) {
          execution.steps.push({ commandId: command.id, capability: command.capability, status: "failed", error: error?.message || String(error) });
          if (command.failureBehavior !== "continue") throw error;
        }
      }
      execution.completedAt = now(); execution.status = "completed";
      ensureLayerAssets(record()).eveBridge.pendingExecution = null;
      await storeExecution(execution, "Agent plan applied");
      emitWorldStateChange("worldAssets", portal.activeWorldId, { reason: "eve-plan" });
      view.review.textContent += `\n\nExecution ${execution.id}: completed.`;
      setStatus("Agent plan completed through World Portal’s allow-listed mission and refinement commands.");
      emitWorldStateChange("evePlanApplied", portal.activeWorldId, { execution, plan });
      pendingPlan = null; validation = null;
      updateSummary();
      return { paused: false, execution };
    } catch (error) {
      execution.completedAt = now(); execution.status = "failed";
      ensureLayerAssets(record()).eveBridge.pendingExecution = null;
      await storeExecution(execution, "Failed Agent plan recorded").catch(console.error);
      setStatus(error?.message || String(error), true);
      return { paused: false, failed: true, execution, error };
    } finally { setBusy(false); }
  }

  async function buildInput() {
    if (busy) return;
    setBusy(true); setStatus("Building selected Orogen input…");
    try { await orogenLab.exportInputSet(); setStatus("Selected Orogen input exported."); }
    catch (error) { setStatus(error?.message || String(error), true); }
    finally { setBusy(false); }
  }

  const agentSkill = createAgentSkillController({
    view, setStatus, exportWorldContext: (options = {}) => exportContext({ ...options, forceAgentSkill: true }),
  });

  function open() { view.overlay.hidden = false; updateSummary(); }
  function close() { view.overlay.hidden = true; }
  view.exportContext.addEventListener("click", () => exportContext());
  view.accuracy.addEventListener("change", syncAccuracyDescription);
  view.reviewPlan.addEventListener("click", reviewPlan);
  view.applyPlan.addEventListener("click", applyPlan);
  view.buildInput.addEventListener("click", buildInput);
  view.close.addEventListener("click", close);
  view.overlay.addEventListener("click", (event) => { if (event.target === view.overlay) close(); });
  openButton?.addEventListener("click", open);
  window.addEventListener(WORLD_PORTAL_STATE_EVENT, (event) => {
    if (event.detail?.key === "activeWorldId") {
      contextHash = ensureLayerAssets(record()).eveBridge?.lastContextHash || null;
      pendingPlan = null; validation = null;
    }
    if (["activeWorldId", "worldAssets", "worldLibrary", "evePlanPaused", "missionCandidateSelected"].includes(event.detail?.key)) updateSummary();
  });
  contextHash = ensureLayerAssets(record()).eveBridge?.lastContextHash || null;
  syncAccuracyDescription(); updateSummary();
  return {
    open, close, exportContext, reviewPlan, reviewPlanFile, applyPlan, buildInput, updateSummary, agentSkill,
    hasValidatedPlan: () => !!(validation?.valid || pendingExecution(record())),
    getBridgeState: () => ({ contextHash, pendingPlan, validation, pendingExecution: pendingExecution(record()), summary: buildBridgeState(record(), { contextHash, pendingPlan, validation }) }),
    setAccuracy(profileId) { view.accuracy.value = accuracyProfile(profileId).id; syncAccuracyDescription(); },
  };
}
