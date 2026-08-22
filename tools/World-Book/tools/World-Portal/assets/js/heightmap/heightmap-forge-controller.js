import { WORLD_PORTAL_STATE_EVENT } from "../world/world-events.js";
import {
  describeHeightmapAsset,
  getActiveHeightmapAsset,
} from "../world/world-assets.js";
import { aspectStatus, loadSurfaceImage, normalizeImage } from "./image-normalizer.js";
import { createHeightmapWorkerClient } from "./heightmap-worker-client.js";
import { drawGrayscalePreview } from "./heightmap-exporter.js";
import { createHeightmapForgeView } from "./heightmap-forge-view.js";
import { createHeightmapForgeActions } from "./heightmap-forge-actions.js";
import {
  createHeightmapOperationGuard, isHeightmapOperationCancelled,
} from "./heightmap-forge-operation-guard.js";
import {
  formatForgePercent as formatPercent, hexToRgb,
  parseForgeResolution as parseResolution, rgbToHex,
  setForgeControlValue as setControlValue,
} from "./heightmap-forge-settings.js";
const PREVIEW_WIDTH = 1024;
const PREVIEW_HEIGHT = 512;
const CONVERTER_VERSION = "1.1.0";
export function createHeightmapForge({ portal, state, autosave }) {
  const openButton = document.getElementById("openHeightmapForge");
  const sidebarSummary = document.getElementById("heightmapForgeSummary");
  const view = createHeightmapForgeView();
  const worker = createHeightmapWorkerClient();
  let source = null;
  let sourceWorldId = null;
  let sourceRevision = 0;
  let previewResult = null;
  let fullResult = null;
  let fullCacheKey = "";
  let sampleU = 0.05;
  let sampleV = 0.50;
  let busy = false;
  const busyOperations = new Set();
  let previewTimer = 0;
  const operations = createHeightmapOperationGuard({
    getWorldId: () => portal.activeWorldId,
    getSourceRevision: () => sourceRevision,
  });
  const previewControls = [
    view.normalizationMode, view.oceanColor, view.tolerance, view.connectedOnly,
    view.edgeSeeds, view.invertMask, view.minimumIslandArea, view.keepLargest,
    view.maximumHoleArea, view.smoothPasses, view.coastHeight, view.inlandStrength,
    view.falloffExponent, view.roughness, view.noiseScale, view.seed,
  ];
  const outputButtons = [view.exportHeightmap, view.exportMask, view.saveWorld, view.sendOrogen];
  function setStatus(message, error = false) {
    view.status.textContent = message;
    view.status.classList.toggle("is-error", error);
  }
  function renderBusy() {
    busy = busyOperations.size > 0;
    view.generatePreview.disabled = busy;
    view.reloadSource.disabled = busy;
    for (const button of outputButtons) button.disabled = busy || !previewResult;
  }
  function beginBusy() {
    const token = Symbol("heightmap-forge-busy");
    busyOperations.add(token);
    renderBusy();
    return token;
  }
  function endBusy(token) {
    busyOperations.delete(token);
    renderBusy();
  }
  function beginSourceOperation(scope) {
    if (!source || String(sourceWorldId) !== String(portal.activeWorldId)) {
      throw new Error("Reload the active world's visual map before continuing.");
    }
    return operations.begin(scope, sourceWorldId);
  }
  function reportOperationError(error, ticket = null) {
    if ((!ticket || operations.isCurrent(ticket)) && !isHeightmapOperationCancelled(error)) {
      console.error(error);
      setStatus(error?.message || String(error), true);
    }
  }
  function updateSidebarSummary() {
    if (sidebarSummary) sidebarSummary.textContent = describeHeightmapAsset(portal);
  }
  function updateOutputs() {
    view.toleranceValue.value = view.tolerance.value;
    view.smoothValue.value = view.smoothPasses.value;
    view.coastValue.value = view.coastHeight.value;
    view.inlandValue.value = view.inlandStrength.value;
    view.falloffValue.value = Number(view.falloffExponent.value).toFixed(2);
    view.roughnessValue.value = view.roughness.value;
    view.noiseValue.value = view.noiseScale.value;
  }
  function currentSettings(width, height) {
    const selected = parseResolution(view.resolution.value);
    const areaScale = (width * height) / Math.max(selected.width * selected.height, 1);
    return {
      normalizationMode: view.normalizationMode.value,
      resolution: `${width}x${height}`,
      mask: {
        oceanColor: hexToRgb(view.oceanColor.value),
        tolerance: Number(view.tolerance.value),
        connectedOnly: view.connectedOnly.checked,
        edgeSeeds: view.edgeSeeds.checked,
        invertMask: view.invertMask.checked,
        sampleX: Math.round(sampleU * (width - 1)),
        sampleY: Math.round(sampleV * (height - 1)),
      },
      cleanup: {
        minimumIslandArea: Math.round(Number(view.minimumIslandArea.value) * areaScale),
        keepLargestLandmass: view.keepLargest.checked,
        maximumHoleArea: Math.round(Number(view.maximumHoleArea.value) * areaScale),
        smoothPasses: Number(view.smoothPasses.value),
      },
      elevation: {
        coastHeight: Number(view.coastHeight.value),
        inlandStrength: Number(view.inlandStrength.value),
        falloffExponent: Number(view.falloffExponent.value),
        roughness: Number(view.roughness.value),
        noiseScale: Number(view.noiseScale.value),
        seed: Number(view.seed.value),
      },
    };
  }
  function applySavedSettings(asset) {
    const settings = asset?.settings;
    if (!settings) return;
    setControlValue(view.resolution, settings.resolution);
    setControlValue(view.normalizationMode, settings.normalizationMode);
    const mask = settings.mask || {};
    if (Array.isArray(mask.oceanColor)) {
      setControlValue(view.oceanColor, rgbToHex(...mask.oceanColor));
    }
    setControlValue(view.tolerance, mask.tolerance);
    setControlValue(view.connectedOnly, mask.connectedOnly);
    setControlValue(view.edgeSeeds, mask.edgeSeeds);
    setControlValue(view.invertMask, mask.invertMask);
    const cleanup = settings.cleanup || {};
    setControlValue(view.minimumIslandArea, cleanup.minimumIslandArea);
    setControlValue(view.keepLargest, cleanup.keepLargestLandmass);
    setControlValue(view.maximumHoleArea, cleanup.maximumHoleArea);
    setControlValue(view.smoothPasses, cleanup.smoothPasses);
    const elevation = settings.elevation || {};
    setControlValue(view.coastHeight, elevation.coastHeight);
    setControlValue(view.inlandStrength, elevation.inlandStrength);
    setControlValue(view.falloffExponent, elevation.falloffExponent);
    setControlValue(view.roughness, elevation.roughness);
    setControlValue(view.noiseScale, elevation.noiseScale);
    setControlValue(view.seed, elevation.seed);
    updateOutputs();
  }
  function renderValidation(validation) {
    view.validation.className = `heightmap-validation ${
      validation.orogenReady ? "is-ready" : "is-error"
    }`;
    view.validation.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = validation.orogenReady ? "Orogen Ready" : "Validation warning";
    const details = document.createElement("span");
    details.textContent = `${validation.width} × ${validation.height} · ratio ${validation.aspectRatio.toFixed(3)}:1 · ${formatPercent(validation.landCoverage)} land · ${validation.landPixels.toLocaleString()} non-black pixels`;
    const ocean = document.createElement("span");
    ocean.textContent = `${validation.landmassCount} landmasses · ${validation.tinyIslandCount} tiny islands · ocean minimum ${validation.minOceanGrayscale ?? "n/a"} · ocean above black ${validation.oceanPixelsAboveZero} · maximum elevation ${validation.maxElevation}`;
    view.validation.append(title, details, ocean);
  }
  function drawSource(normalized) {
    const context = view.sourceCanvas.getContext("2d");
    context.clearRect(0, 0, view.sourceCanvas.width, view.sourceCanvas.height);
    context.drawImage(normalized.canvas, 0, 0, view.sourceCanvas.width, view.sourceCanvas.height);
  }
  async function processNormalized(normalized, settings, label, ticket) {
    let result;
    try {
      result = await worker.process({
        rgba: new Uint8ClampedArray(normalized.imageData.data),
        width: normalized.width,
        height: normalized.height,
        settings,
        onProgress(message) {
          if (operations.isCurrent(ticket)) {
            setStatus(`${label}: ${message.stage}… ${Math.round(message.fraction * 100)}%`);
          }
        },
      });
    } catch (error) {
      operations.assertCurrent(ticket);
      throw error;
    }
    operations.assertCurrent(ticket);
    return result;
  }
  async function buildPreview() {
    if (!source) return null;
    let ticket;
    try {
      ticket = beginSourceOperation("preview");
    } catch (error) {
      reportOperationError(error, ticket);
      return null;
    }
    const busyToken = beginBusy();
    fullResult = null;
    fullCacheKey = "";
    operations.cancel("full");
    try {
      const settings = currentSettings(PREVIEW_WIDTH, PREVIEW_HEIGHT);
      const normalized = normalizeImage(
        source, PREVIEW_WIDTH, PREVIEW_HEIGHT,
        settings.normalizationMode, view.oceanColor.value,
      );
      drawSource(normalized);
      const result = await processNormalized(normalized, settings, "Preview", ticket);
      operations.assertCurrent(ticket);
      previewResult = result;
      drawGrayscalePreview(
        view.maskCanvas, previewResult.mask,
        previewResult.width, previewResult.height, true,
      );
      drawGrayscalePreview(
        view.outputCanvas, previewResult.heightmap,
        previewResult.width, previewResult.height, false,
      );
      renderValidation(previewResult.validation);
      setStatus("Preview generated locally. The original visual map has not been changed.");
      return previewResult;
    } catch (error) {
      if (operations.isCurrent(ticket)) previewResult = null;
      reportOperationError(error, ticket);
      return null;
    } finally {
      endBusy(busyToken);
    }
  }
  function fullKey(settings, width, height, ticket) {
    return JSON.stringify({
      world: ticket.worldId, generation: ticket.worldGeneration,
      sourceRevision: ticket.sourceRevision, width, height, settings,
    });
  }
  async function ensureFullResult() {
    const ticket = beginSourceOperation("full");
    const { width, height } = parseResolution(view.resolution.value);
    const settings = currentSettings(width, height);
    const key = fullKey(settings, width, height, ticket);
    if (fullResult && key === fullCacheKey) return { result: fullResult, settings };
    const busyToken = beginBusy();
    try {
      setStatus(`Preparing ${width} × ${height} full-resolution canvas…`);
      const normalized = normalizeImage(
        source, width, height, settings.normalizationMode, view.oceanColor.value,
      );
      const result = await processNormalized(normalized, settings, "Full resolution", ticket);
      operations.assertCurrent(ticket);
      fullResult = result;
      fullCacheKey = key;
      renderValidation(fullResult.validation);
      return { result: fullResult, settings };
    } finally {
      endBusy(busyToken);
    }
  }
  async function loadActiveSource() {
    const world = portal.getActiveWorld();
    const worldId = String(world.id ?? portal.activeWorldId);
    const surface = portal.getActiveSurface();
    sourceRevision += 1;
    const ticket = operations.begin("source-load", worldId);
    const busyToken = beginBusy();
    previewResult = null;
    fullResult = null;
    fullCacheKey = "";
    window.clearTimeout(previewTimer);
    source?.close?.();
    source = null;
    sourceWorldId = null;
    let loaded = null;
    try {
      view.worldLabel.textContent = `${world.name} · non-destructive Orogen preparation`;
      view.worldName.textContent = world.name;
      setStatus("Loading the active world’s original visual map…");
      loaded = await loadSurfaceImage(surface);
      operations.assertCurrent(ticket);
      source = loaded;
      loaded = null;
      sourceWorldId = worldId;
      const status = aspectStatus(source.width, source.height);
      view.sourceDimensions.textContent = `${source.width} × ${source.height}`;
      view.aspectStatus.textContent = status.message;
      applySavedSettings(getActiveHeightmapAsset(portal));
      await buildPreview();
    } catch (error) {
      loaded?.close?.();
      reportOperationError(error, ticket);
    } finally {
      endBusy(busyToken);
    }
  }
  async function open() {
    view.overlay.hidden = false;
    if (!source || String(sourceWorldId) !== String(portal.activeWorldId)) await loadActiveSource();
  }
  function close() {
    view.overlay.hidden = true;
  }
  const actions = createHeightmapForgeActions({
    portal, state, autosave, view, converterVersion: CONVERTER_VERSION,
    getSource: () => source,
    beginOperation: beginSourceOperation,
    assertCurrent: operations.assertCurrent,
    ensureFullResult,
    reportError: reportOperationError,
    setStatus, close, updateSidebarSummary,
  });
  function schedulePreview() {
    window.clearTimeout(previewTimer);
    fullResult = null;
    fullCacheKey = "";
    operations.cancel("full");
    previewTimer = window.setTimeout(buildPreview, 180);
  }
  view.sourceCanvas.addEventListener("click", (event) => {
    if (!source || busy) return;
    const bounds = view.sourceCanvas.getBoundingClientRect();
    sampleU = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    sampleV = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const context = view.sourceCanvas.getContext("2d");
    const x = Math.min(view.sourceCanvas.width - 1, Math.floor(sampleU * view.sourceCanvas.width));
    const y = Math.min(view.sourceCanvas.height - 1, Math.floor(sampleV * view.sourceCanvas.height));
    const pixel = context.getImageData(x, y, 1, 1).data;
    view.oceanColor.value = rgbToHex(pixel[0], pixel[1], pixel[2]);
    setStatus(`Ocean sampled at ${view.oceanColor.value}. Rebuilding preview…`);
    schedulePreview();
  });
  for (const control of previewControls) {
    control.addEventListener("input", () => {
      updateOutputs();
      schedulePreview();
    });
    control.addEventListener("change", schedulePreview);
  }
  view.resolution.addEventListener("change", () => {
    fullResult = null;
    fullCacheKey = "";
    operations.cancel("full");
  });
  view.generatePreview.addEventListener("click", buildPreview);
  view.reloadSource.addEventListener("click", loadActiveSource);
  view.exportHeightmap.addEventListener("click", actions.exportHeightmap);
  view.exportMask.addEventListener("click", actions.exportMask);
  view.saveWorld.addEventListener("click", actions.saveToWorld);
  view.sendOrogen.addEventListener("click", actions.sendToOrogen);
  view.closeButton.addEventListener("click", close);
  view.overlay.addEventListener("click", (event) => {
    if (event.target === view.overlay) close();
  });
  openButton?.addEventListener("click", open);
  function onWorldEvent(event) {
    const key = event.detail?.key;
    if (key === "activeWorldId") {
      operations.advanceWorld();
      sourceRevision += 1;
      window.clearTimeout(previewTimer);
      source?.close?.();
      source = null;
      sourceWorldId = null;
      previewResult = null;
      fullResult = null;
      fullCacheKey = "";
      busyOperations.clear();
      renderBusy();
    }
    if (["activeWorldId", "worldLibrary", "worldAssets"].includes(key)) {
      updateSidebarSummary();
      if (!view.overlay.hidden && key === "activeWorldId") loadActiveSource();
    }
  }
  window.addEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
  updateOutputs();
  updateSidebarSummary();
  renderBusy();
  function getSettings() {
    const selected = parseResolution(view.resolution.value);
    return currentSettings(selected.width, selected.height);
  }
  async function applyParameters(parameters = {}, { regenerate = true } = {}) {
    const ticket = beginSourceOperation("apply-parameters");
    const current = getSettings();
    const settings = {
      ...current,
      ...parameters,
      mask: { ...current.mask, ...(parameters.mask || {}) },
      cleanup: { ...current.cleanup, ...(parameters.cleanup || {}) },
      elevation: { ...current.elevation, ...(parameters.elevation || {}) },
    };
    applySavedSettings({ settings });
    fullResult = null; fullCacheKey = "";
    if (regenerate) await buildPreview();
    operations.assertCurrent(ticket);
    return settings;
  }
  return {
    open,
    close,
    buildPreview,
    regenerateMask: actions.regenerateMask,
    regenerateElevation: actions.regenerateElevation,
    getSettings,
    applyParameters,
    getCurrentResult: () => fullResult || previewResult,
    destroy() {
      operations.destroy();
      source?.close?.();
      worker.dispose();
      window.clearTimeout(previewTimer);
      window.removeEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
      view.overlay.remove();
    },
  };
}
