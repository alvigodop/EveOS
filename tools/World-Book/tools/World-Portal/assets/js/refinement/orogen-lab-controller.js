import { WORLD_PORTAL_STATE_EVENT, emitWorldStateChange } from "../world/world-events.js";
import {
  attachLayerToSession, createLayerRecord, createRefinementPass, describeLayer,
  ensureLayerAssets, getCanonicalLayer, getLayer, layerDomain, markLayerCanonical,
  upsertLayer,
} from "../world/world-layer-store.js";
import { checksumBlob, downloadBlob, slugify } from "./image-layer-utils.js";
import { createOrogenLabView } from "./orogen-lab-view.js";
import { createOrogenRefinementEngine } from "./orogen-refinement-engine.js";
import { extractImageContainerMetadata } from "./image-container-metadata.js";
import { createOrogenAnalysisPresenter } from "./orogen-analysis-presenter.js";
import { createOrogenInputService } from "../orogen/orogen-input-service.js";
import { createOrogenCommandService } from "./orogen-command-service.js";
import { renderOrogenLayerList } from "./orogen-layer-list.js";
import { createOrogenLabSessionActions } from "./orogen-lab-session-actions.js";
import { createEvidenceAssimilationController } from "./evidence-assimilation-controller.js";
import { createLabIntelligenceController } from "./lab-intelligence-controller.js";
function option(value, label) {
  const element = document.createElement("option"); element.value = value; element.textContent = label;
  return element;
}
const formatPercent = (value) => Number.isFinite(value)
  ? `${(value * 100).toFixed(value < 0.01 ? 3 : 1)}%` : "n/a";
const selectedValue = (select, fallback = "") => select?.value || fallback;
function layerFilename(layer) {
  return `${slugify(layer.name)}.${layer.fileFormat?.includes("jpeg") ? "jpg" : "png"}`;
}
export function createOrogenLab({ portal, state, sceneApi, autosave }) {
  const view = createOrogenLabView();
  const engine = createOrogenRefinementEngine();
  const presenter = createOrogenAnalysisPresenter({
    view, engine, getWorldName: () => portal.getActiveWorld().name, setStatus,
  });
  const inputService = createOrogenInputService({ portal, autosave, setStatus });
  const commands = createOrogenCommandService({ portal, autosave, engine });
  const openButton = document.getElementById("openOrogenLab");
  const sidebarSummary = document.getElementById("orogenLabSummary");
  let activeSessionId = "";
  let candidate = null;
  let busy = false;
  let evidenceController = null;
  let intelligenceController = null;
  const record = () => portal.getActiveRecord(); const assets = () => ensureLayerAssets(record());
  const layers = () => assets().layers;
  const sessions = () => assets().analysisSessions;
  const passes = () => assets().refinementPasses;
  const layerById = (id) => getLayer(record(), id);
  function setStatus(message, error = false) {
    view.status.textContent = message; view.status.classList.toggle("is-error", error);
  }
  function setBusy(value) {
    busy = !!value;
    view.overlay.classList.toggle("is-busy", busy);
    view.overlay.querySelectorAll("button,input,select,textarea").forEach((control) => {
      if (!control.classList.contains("orogen-lab__close")) control.disabled = busy;
    });
  }
  function updateSidebarSummary() {
    const data = ensureLayerAssets(record());
    if (sidebarSummary) {
      sidebarSummary.textContent = `${data.layers.length} layers · ${data.analysisSessions.length} Orogen sessions · ${data.refinementPasses.length} refinement passes`;
    }
  }
  function sessionLayers() {
    if (!activeSessionId) return layers();
    return layers().filter((layer) => layer.sessionId === activeSessionId);
  }
  function fillLayerSelect(select, sourceLayers, previous, emptyLabel = "Choose layer") {
    select.replaceChildren(option("", emptyLabel), ...sourceLayers.map((layer) => (
      option(layer.id, `${layer.name} · ${layer.type}`)
    )));
    select.value = sourceLayers.some((layer) => layer.id === previous) ? previous : "";
  }
  function refreshSelectors() {
    const previousSession = activeSessionId || view.sessionSelect.value;
    view.sessionSelect.replaceChildren(option("", "All world layers"), ...sessions().map((session) => (
      option(session.id, session.name)
    )));
    activeSessionId = sessions().some((session) => session.id === previousSession)
      ? previousSession : "";
    view.sessionSelect.value = activeSessionId;
    const available = sessionLayers();
    const previousA = view.compareA.value;
    const previousB = view.compareB.value;
    fillLayerSelect(view.compareA, available, previousA, "Layer A");
    fillLayerSelect(view.compareB, available, previousB, "Layer B");
    if (!view.compareA.value && available[0]) view.compareA.value = available[0].id;
    if (!view.compareB.value && available[1]) view.compareB.value = available[1].id;
    const masks = layers().filter((layer) => layerDomain(layer.type) === "mask");
    fillLayerSelect(
      view.coastlineMask, masks,
      view.coastlineMask.value || getCanonicalLayer(record(), "mask")?.id,
      "No coastline mask",
    );
    const previousPass = view.parentPass.value;
    view.parentPass.replaceChildren(option("", "No parent pass"), ...passes().map((pass) => (
      option(pass.id, pass.name)
    )));
    view.parentPass.value = passes().some((pass) => pass.id === previousPass)
      ? previousPass : "";
  }
  function refreshLayerList() {
    renderOrogenLayerList({
      source: sessionLayers(), view, record, autosave, engine, refresh, renderComparison,
    });
  }

  async function ensureLayerAnalysis(layer) {
    if (!layer?.blob) return;
    const metadataAdded = !layer.metadata?.imageContainer;
    if (metadataAdded) layer.metadata = { ...(layer.metadata || {}), imageContainer: await extractImageContainerMetadata(layer.blob) };
    if (layer.analysisVersion === "2.0.0" && layer.analysis) {
      if (metadataAdded) autosave.schedule("Image container metadata inspected");
      return;
    }
    layer.analysis = await engine.analyze(layer);
    layer.analysis.file = {
      byteSize: layer.byteSize || layer.blob.size,
      mimeType: layer.mimeType || layer.blob.type,
      lastModified: layer.lastModified || null,
      checksum: layer.checksum || null,
      imageContainer: layer.metadata.imageContainer,
    };
    layer.analysisVersion = "2.0.0";
    layer.updatedAt = new Date().toISOString();
    autosave.schedule("Layer intelligence refreshed");
  }
  async function renderComparison() {
    if (busy) return;
    const layerA = layerById(view.compareA.value); const layerB = layerById(view.compareB.value);
    try {
      setStatus("Rendering layer comparison…");
      await Promise.all([ensureLayerAnalysis(layerA), ensureLayerAnalysis(layerB)]);
      await engine.renderCompare(
        view.compareCanvas, layerA, layerB,
        view.compareMode.value, Number(view.compareOpacity.value),
      );
      view.differenceLegend.hidden = view.compareMode.value !== "difference";
      view.compareCaption.textContent = layerA
        ? `${layerA.name}${layerB ? ` compared with ${layerB.name}` : ""}`
        : "Choose layers to compare.";
      await presenter.render(layerA, layerB);
      setStatus(layerA ? describeLayer(layerA) : "Ready.");
    } catch (error) {
      setStatus(error?.message || String(error), true);
    }
  }
  function setCandidate(result, name, parentLayerIds, operation) {
    candidate = { ...result, name, parentLayerIds, operation, savedLayerId: null };
    view.resultName.value = name;
    view.resultCaption.textContent = `${name} · provisional · ${result.width} × ${result.height}`;
    view.resultShell.hidden = false;
    engine.drawResult(view.resultCanvas, result);
    setStatus(`${name} generated non-destructively. Save it or create a refinement pass.`);
  }
  function requirePair(domain) {
    const layerA = layerById(view.compareA.value);
    const layerB = layerById(view.compareB.value);
    if (!layerA || !layerB) throw new Error("Choose both Layer A and Layer B.");
    if (domain && (layerDomain(layerA.type) !== domain || layerDomain(layerB.type) !== domain)) {
      throw new Error(`Both selected layers must be ${domain} layers.`);
    }
    return { layerA, layerB };
  }
  async function runTask(label, task) {
    if (busy) return;
    setBusy(true);
    setStatus(label);
    try {
      await task();
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), true);
    } finally {
      setBusy(false);
      refreshSelectors();
    }
  }
  async function saveCandidate() {
    if (!candidate) throw new Error("Generate a refinement result first.");
    if (candidate.savedLayerId) return layerById(candidate.savedLayerId);
    const blob = await engine.resultToBlob(candidate);
    const layer = upsertLayer(record(), createLayerRecord({
      blob,
      name: view.resultName.value.trim() || candidate.name,
      type: candidate.type,
      category: "interpretation",
      sourceTool: "World Portal Refinement Lab",
      sourceVersion: "0.19.1",
      sessionId: activeSessionId || null,
      parentLayerIds: candidate.parentLayerIds,
      width: candidate.width,
      height: candidate.height,
      status: "provisional", checksum: await checksumBlob(blob),
      analysis: candidate.analysis || null,
      notes: view.notes.value,
    }));
    candidate.savedLayerId = layer.id;
    if (activeSessionId) attachLayerToSession(record(), activeSessionId, layer.id, "output");
    await autosave.flush("Refinement layer saved");
    refresh();
    return layer;
  }

  function refresh() {
    view.worldLabel.textContent = `${portal.getActiveWorld().name} · reversible planetary refinement`;
    refreshSelectors(); refreshLayerList(); updateSidebarSummary(); renderComparison();
    evidenceController?.refresh();
    intelligenceController?.refresh();
  }
  const sessionActions = createOrogenLabSessionActions({
    record, view, engine, autosave, setStatus, runTask,
    setActiveSession(id) { activeSessionId = id || ""; },
    clearCandidate() { candidate = null; view.resultShell.hidden = true; },
    refresh,
  });
  evidenceController = createEvidenceAssimilationController({
    portal, view, engine, commands, autosave, runTask, setCandidate, setStatus,
    getActiveSessionId: () => activeSessionId, refreshLab: refresh, renderComparison,
  });
  intelligenceController = createLabIntelligenceController({
    portal, view, engine, autosave, setStatus,
    getActiveSessionId: () => activeSessionId,
  });
  const importSessionFiles = sessionActions.importFiles;
  view.importSession.addEventListener("click", () => importSessionFiles([...(view.files.files || [])]));
  view.clearImages.addEventListener("click", sessionActions.clearImages);
  view.sessionSelect.addEventListener("change", () => { activeSessionId = view.sessionSelect.value; refresh(); });
  for (const control of [view.compareA, view.compareB, view.compareMode, view.compareOpacity]) {
    control.addEventListener("input", renderComparison); control.addEventListener("change", renderComparison);
  }
  view.buildMaskMerge.addEventListener("click", () => runTask("Merging land evidence…", async () => {
    const { layerA, layerB } = requirePair("mask");
    const result = await engine.mergeMasks(
      layerA, layerB, view.maskMergeMode.value, Number(view.tinyThreshold.value),
    );
    setCandidate(result, `${portal.getActiveWorld().name} repaired mask`, [layerA.id, layerB.id], view.maskMergeMode.value);
  }));
  view.buildConfidence.addEventListener("click", () => runTask("Building confidence map…", async () => {
    const { layerA, layerB } = requirePair("mask");
    const result = await engine.confidence(layerA, layerB);
    setCandidate(result, `${portal.getActiveWorld().name} mask confidence`, [layerA.id, layerB.id], "confidence");
  }));
  view.buildConsensus.addEventListener("click", () => runTask("Building multi-pass mask consensus…", async () => {
    const source = sessionLayers().filter((layer) => layerDomain(layer.type) === "mask");
    const votes = Number(view.consensusVotes.value);
    const result = await engine.consensus(source, votes, Number(view.tinyThreshold.value));
    setCandidate(result, `${portal.getActiveWorld().name} consensus mask`, source.map((layer) => layer.id), "consensus");
  }));
  view.blendHeightmaps.addEventListener("click", () => runTask("Fusing elevation evidence…", async () => {
    const { layerA, layerB } = requirePair("heightmap");
    const maskLayer = view.coastlineLock.checked ? layerById(view.coastlineMask.value) : null;
    if (view.coastlineLock.checked && !maskLayer) throw new Error("Choose a coastline mask or disable coastline lock.");
    const result = await engine.blendHeightmaps(layerA, layerB, {
      weightB: Number(view.heightWeight.value),
      detailStrength: Number(view.heightDetail.value),
      contrast: Number(view.heightContrast.value),
      smoothing: Number(view.heightSmoothing.value),
      maskLayer,
    });
    const parents = [layerA.id, layerB.id, ...(maskLayer ? [maskLayer.id] : [])];
    setCandidate(result, `${portal.getActiveWorld().name} composite heightmap`, parents, "heightmap-blend");
  }));
  view.medianHeightmaps.addEventListener("click", () => runTask("Building median multi-pass elevation…", async () => {
    const source = sessionLayers().filter((layer) => layerDomain(layer.type) === "heightmap");
    const maskLayer = view.coastlineLock.checked ? layerById(view.coastlineMask.value) : null;
    const result = await engine.medianHeightmaps(source, maskLayer);
    const parents = [...source.map((layer) => layer.id), ...(maskLayer ? [maskLayer.id] : [])];
    setCandidate(result, `${portal.getActiveWorld().name} median heightmap`, parents, "median-heightmap");
  }));
  view.synthesizeVisual.addEventListener("click", () => runTask("Synthesizing canonical texture…", async () => {
    const { layerA, layerB } = requirePair("visual");
    const maskLayer = layerById(view.coastlineMask.value);
    const result = await engine.compositeVisual(layerA, layerB, maskLayer, Number(view.visualInfluence.value));
    const parents = [layerA.id, layerB.id, ...(maskLayer ? [maskLayer.id] : [])];
    setCandidate(result, `${portal.getActiveWorld().name} refined visual map`, parents, "visual-synthesis");
  }));
  view.saveProvisional.addEventListener("click", () => runTask("Saving provisional layer…", saveCandidate));
  view.createPass.addEventListener("click", () => runTask("Creating refinement pass…", async () => {
    const layer = await saveCandidate();
    const pass = createRefinementPass(record(), {
      sessionId: activeSessionId || null,
      parentPassId: selectedValue(view.parentPass),
      name: view.resultName.value.trim() || `Refinement pass ${passes().length + 1}`,
      inputLayerIds: candidate.parentLayerIds,
      outputLayerIds: [layer.id],
      settings: { operation: candidate.operation },
      validation: candidate.analysis || null,
      notes: view.notes.value,
    });
    layer.passId = pass.id;
    await autosave.flush("Refinement pass created");
    setStatus(`${pass.name} saved with parent lineage intact.`);
    refresh();
  }));
  view.markCanonical.addEventListener("click", () => runTask("Promoting canonical layer…", async () => {
    const layer = layerById(view.compareA.value);
    if (!layer) throw new Error("Choose a layer in Layer A first.");
    markLayerCanonical(record(), layer.id);
    await autosave.flush("Canonical layer promoted");
    setStatus(`${layer.name} is now canonical for its layer domain.`);
    refresh();
  }));
  view.promoteVisual.addEventListener("click", () => runTask("Promoting visual map…", async () => {
    const layer = layerById(view.compareA.value);
    if (!layer || layerDomain(layer.type) !== "visual") {
      throw new Error("Choose a visual, terrain, or satellite layer in Layer A.");
    }
    const active = record();
    active.surface.textureBlob = layer.blob;
    active.surface.textureName = layer.filename || layerFilename(layer);
    active.surface.textureType = layer.blob.type || "image/png";
    active.surface.width = layer.width;
    active.surface.height = layer.height;
    markLayerCanonical(active, layer.id);
    await sceneApi.setWorldSurface(portal.getActiveSurface());
    await autosave.flush("Active visual map promoted");
    emitWorldStateChange("worldSurface", portal.activeWorldId, { layerId: layer.id });
    setStatus(`${layer.name} is now the active visual map. The original remains in the layer registry.`);
    refresh();
  }));
  view.exportSelected.addEventListener("click", () => {
    const layer = layerById(view.compareA.value);
    if (!layer?.blob) return setStatus("Choose a layer in Layer A first.", true);
    downloadBlob(layer.blob, layerFilename(layer));
    setStatus(`${layer.name} exported.`);
  });
  async function exportInputSet(options = {}) {
    return inputService.exportBundle(options);
  }
  async function finalizeInput(options = {}) {
    return inputService.finalize(options, { persist: true });
  }
  view.exportInputSet.addEventListener("click", () => runTask("Exporting next-pass Orogen input set…", exportInputSet));
  function open() { view.overlay.hidden = false; refresh(); }
  function close() { view.overlay.hidden = true; }
  view.closeButton.addEventListener("click", close);
  view.overlay.addEventListener("click", (event) => {
    if (event.target === view.overlay) close();
  });
  openButton?.addEventListener("click", open);
  function onWorldEvent(event) {
    if (["activeWorldId", "worldAssets", "worldLibrary"].includes(event.detail?.key)) {
      candidate = null;
      engine.clearCache();
      intelligenceController?.clearCache();
      updateSidebarSummary();
      if (!view.overlay.hidden) refresh();
    }
  }
  window.addEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
  updateSidebarSummary();
  return {
    open, close, refresh, engine, commands,
    exportInputSet,
    finalizeInput, importSessionFiles,
    buildEvidenceNextPass: (options) => commands.buildEvidenceNextPass(options),
    getContextState() { return { sessionId: activeSessionId || null, layerAId: view.compareA.value || null, layerBId: view.compareB.value || null, comparisonMode: view.compareMode.value, comparisonOpacity: Number(view.compareOpacity.value), canonicalCoastlineLayerId: view.coastlineMask.value || null, maskMergeMode: view.maskMergeMode.value, tinyIslandThreshold: Number(view.tinyThreshold.value), consensusVotes: Number(view.consensusVotes.value), sourceWeight: 1 - Number(view.heightWeight.value), orogenWeight: Number(view.heightWeight.value), interiorDetailRecovery: Number(view.heightDetail.value), contrast: Number(view.heightContrast.value), smoothing: Number(view.heightSmoothing.value), coastlineLock: view.coastlineLock.checked, visualLandInfluence: Number(view.visualInfluence.value), parentPassId: view.parentPass.value || null, evidenceAssimilation: evidenceController?.getContextState() || null }; },
    selectLayers({ layerAId, layerBId, coastlineMaskLayerId } = {}) {
      if (layerAId) view.compareA.value = layerAId;
      if (layerBId) view.compareB.value = layerBId;
      if (coastlineMaskLayerId) view.coastlineMask.value = coastlineMaskLayerId;
      return renderComparison();
    },
    destroy() {
      engine.dispose();
      window.removeEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
      view.overlay.remove();
    },
  };
}
