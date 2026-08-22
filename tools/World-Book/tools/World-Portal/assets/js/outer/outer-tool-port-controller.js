import { createOuterToolPanelView, createOuterToolPortView } from "./outer-tool-port-view.js";
import { createOuterToolRegistry, initializationHint } from "./outer-tool-registry.js";
import {
  describeReturnFiles, resolveSendPair, selectableLayers,
} from "./orogen-port-adapter.js";
import { createOuterToolSync, syncStateMatchesHandoff } from "./outer-tool-sync.js";
import { createOuterToolFrame, matchOuterToolFrameContext } from "./outer-tool-frame.js";
import { createOuterToolBridge } from "./outer-tool-bridge.js";
import { createOrogenPlanetMirror } from "./orogen-planet-mirror.js";
import { createOrogenUpdateChecker } from "./orogen-update-checker.js";
import { installOrogenForgeConnector } from "./orogen-forge-connector.js";
import { renderOuterToolPanel } from "./outer-tool-panel-controller.js";
import { createOrogenHandoffController } from "./orogen-handoff-controller.js";
import { ensureLayerAssets } from "../world/world-layer-store.js";
import { WORLD_PORTAL_STATE_EVENT } from "../world/world-events.js";
import { downloadOuterToolJson, fillOuterToolSelect } from "./outer-tool-port-utils.js";
import { revalidateOuterToolContext } from "./outer-tool-sync-lifecycle.js";
export function createOuterToolPort({ portal, orogenLab, autosave, sceneApi }) {
  const registry = createOuterToolRegistry();
  const panel = createOuterToolPanelView();
  const view = createOuterToolPortView();
  const record = () => portal.getActiveRecord();
  let activeToolId = "orogen";
  const userSelection = { maskLayerId: null, heightmapLayerId: null };
  let busy = false;
  let worldGeneration = 0;
  let boundFrameRevision = -1;
  const sync = createOuterToolSync({ onStateChange: renderSync });
  const frame = createOuterToolFrame({ onStateChange: renderFrame });
  const mirror = createOrogenPlanetMirror({
    viewport: document.getElementById("viewport"),
    sceneApi,
    onStateChange(state) {
      if (view.mirrorPlanet) view.mirrorPlanet.textContent = state.connected ? "Mirror active" : "Mirror Planet";
    },
  });
  const bridge = createOuterToolBridge({
    onMetrics(detail) {
      const current = record();
      if (detail.world?.key !== current?.id || detail.world?.sourceCommit !== activeTool()?.commit) return;
      const assets = ensureLayerAssets(current);
      assets.orogen.bridgeMetrics = {
        ...JSON.parse(JSON.stringify(detail)),
        receivedAt: new Date().toISOString(),
      };
      autosave?.flush?.("Validated Orogen world metrics received").catch?.(() => {});
      window.dispatchEvent(new CustomEvent("world-portal:orogen-world-metrics", { detail }));
    },
  });
  const updateChecker = createOrogenUpdateChecker({ onStateChange: renderUpdate });
  const handoffController = createOrogenHandoffController({
    portal, orogenLab, autosave, sync, frame, view,
    getTool: activeTool,
    getPair: () => resolveSendPair(record(), currentOverrides()),
    downloadJson: downloadOuterToolJson,
    setStatus,
    onBusyChange(value) {
      busy = value;
      renderSendStage();
      renderReturnPreview();
      renderSync();
    },
    openTool: openToolTab,
    markStage,
    openPort: open,
    getWorldGeneration: () => worldGeneration,
  });
  const forgeConnector = installOrogenForgeConnector({
    getActiveWorld: () => portal.getActiveWorld(),
    getWorldGeneration: () => worldGeneration,
    onReceive: handoffController.receiveForgeHeightmap,
    onError: (error) => setStatus(`Forge connector failed: ${error?.message || error}`),
  });

  function setStatus(message) {
    view.status.textContent = message;
  }
  function activeTool() {
    return registry.getTool(activeToolId);
  }

  function renderPanel() {
    renderOuterToolPanel({ panel, registry, onOpen: open });
  }
  // Only a deliberate change counts as an override. Reading the select back as
  // an override would let list order silently outrank the canonical layer.
  function currentOverrides() {
    return { maskLayerId: userSelection.maskLayerId, heightmapLayerId: userSelection.heightmapLayerId };
  }

  function renderSendStage() {
    const current = record();
    if (!current) return null;
    const masks = selectableLayers(current, "mask");
    const heightmaps = selectableLayers(current, "heightmap");
    // Drop a stale override once the layer it named is gone.
    if (userSelection.maskLayerId && !masks.some((l) => l.id === userSelection.maskLayerId)) userSelection.maskLayerId = null;
    if (userSelection.heightmapLayerId && !heightmaps.some((l) => l.id === userSelection.heightmapLayerId)) userSelection.heightmapLayerId = null;
    const pair = resolveSendPair(current, currentOverrides());
    fillOuterToolSelect(view.maskSelect, masks, pair.mask?.id || null);
    fillOuterToolSelect(view.heightmapSelect, heightmaps, pair.heightmap?.id || null);
    if (pair.mask) view.maskSelect.value = pair.mask.id;
    if (pair.heightmap) view.heightmapSelect.value = pair.heightmap.id;
    const source = pair.usedOverride ? "chosen" : (pair.usingCanonical ? "canonical" : "latest generated");
    view.pairState.textContent = pair.ready
      ? `Ready to send (${source}): ${pair.mask.name} + ${pair.heightmap.name}`
      : pair.problems.join(" ");
    view.pairState.classList.toggle("outer-port__pair--blocked", !pair.ready);
    view.send.disabled = !pair.ready || busy;
    return pair;
  }

  function renderSync(state = sync.getState()) {
    if (!view.syncToggle) return;
    if (view.downloadLabel) {
      view.downloadLabel.textContent = state.syncing
        ? "Download files to disk (not needed while syncing)"
        : "Download files to disk (needed to hand the pair over)";
    }
    view.syncToggle.checked = state.syncing;
    view.syncToggle.disabled = !state.supported || busy;
    if (view.mirrorPlanet) {
      view.mirrorPlanet.disabled = !state.syncing || !frameSyncContext() || busy;
    }
    view.syncState.textContent = state.reason;
    view.syncRow.classList.toggle("outer-port__sync--on", state.syncing);
    view.syncRow.classList.toggle("outer-port__sync--blocked", !state.supported);
    if (view.workNote) {
      view.workNote.textContent = state.syncing
        ? "World sync is on: the tool opens already showing this world. Steps 1 and 2 are only needed to send a newer pair."
        : "World Portal relays only audited camera gestures; settings remain in this port.";
    }
    if (panel.summary) {
      panel.summary.textContent = state.supported
        ? (state.syncing
          ? `${state.worldName || "Active world"} sync is on.`
          : `${state.worldName || "Active world"} sync is off.`)
        : "Outer tools run in their own page. Results return as evidence.";
    }
    bridge?.updateWorld(frameSyncContext());
  }

  function frameSyncContext(state = frame.getState()) {
    return matchOuterToolFrameContext(state, sync.getFrameContext(), window.location.href);
  }
  function renderFrame(state = frame.getState()) {
    if (!view.frameState) return;
    if (state.loading && mirror.getState().requested) {
      mirror.suspend("The Orogen frame is reloading; the previous mirror was hidden.");
    }
    if (!state.attached) view.frameState.textContent = "Tool not loaded.";
    else if (state.loading) view.frameState.textContent = "Loading the tool…";
    else if (state.loaded) {
      const attached = frameSyncContext(state);
      const generator = String(state.sourceUrl || "").includes("/outer/orogen/index.html");
      view.frameState.textContent = attached
        ? "Orogen import view attached to this exact world revision."
        : (generator ? "Orogen generator view is independent of World sync." : "Orogen is not attached to the active synced world.");
    }
    view.frameState.hidden = false;
    view.frameState.classList.toggle("is-loaded", state.loaded && !state.loading);
    if (state.loaded && state.loadRevision !== boundFrameRevision) {
      boundFrameRevision = state.loadRevision;
      const context = frameSyncContext(state);
      if (context) bridge.attach({ sourceWindow: frame.contentWindow, sourceUrl: state.sourceUrl, context });
      else bridge.detach();
      if (context) {
        const bind = mirror.getState().requested ? mirror.start : mirror.prepare;
        bind(frame.element, context).catch((error) => {
          setStatus(`Orogen view connector failed: ${error?.message || error}`);
        });
      } else mirror.invalidate(mirror.getState().requested
        ? "The Orogen frame left the exact synced import view; the mirror was cleared."
        : "Orogen view tracking awaits an exact synced import view.");
    }
    renderSync();
  }

  function showView(which) {
    const tool = activeTool();
    if (!tool) return;
    const entry = which === "generator" ? (tool.generator || tool.entry) : tool.entry;
    frame.load(tool.id, entry, { context: sync.getFrameContext() });
    markStage(which === "generator" ? "work" : "work");
  }

  function markStage(active) {
    for (const [name, el] of [["send", view.sendStage], ["work", view.workStage], ["return", view.returnStage]]) {
      el?.classList.toggle("outer-port__stage--active", name === active);
    }
  }

  function renderProvenance() {
    const tool = activeTool();
    if (!tool) return;
    view.title.textContent = tool.name;
    view.subtitle.textContent = `${tool.kind} · results return as provisional evidence`;
    view.provenance.textContent = tool.commit
      ? `${tool.path} @ ${tool.commitShort} · ${tool.license || "see notices"} · every returned layer is stamped with this commit`
      : `${tool.path} · ${tool.license || "see notices"} · commit unknown, provenance will record availability only`;
    view.openGenerator.hidden = !tool.generator;
  }

  function renderUpdate(state = updateChecker.getState()) {
    if (!view.updateState) return;
    view.updateState.textContent = state.reason;
    view.checkUpdate.disabled = state.checking || !activeTool()?.commit;
  }

  function renderReturnPreview() {
    const files = [...(view.returnFiles.files || [])];
    view.rolePreview.innerHTML = "";
    for (const entry of describeReturnFiles(files)) {
      const item = document.createElement("li");
      item.className = entry.matched ? "" : "outer-port__role--unmatched";
      const name = document.createElement("span");
      name.textContent = entry.name;
      const role = document.createElement("strong");
      role.textContent = entry.role;
      item.append(name, role);
      view.rolePreview.appendChild(item);
    }
    view.importButton.disabled = !files.length || busy;
  }

  function openToolTab(entry) {
    const tool = activeTool();
    frame.load(tool?.id || activeToolId, entry, { context: sync.getFrameContext() });
    return true;
  }

  function importReturned() {
    const files = [...(view.returnFiles.files || [])];
    return handoffController.importReturned(files).then((imported) => {
      if (!imported) return null;
      view.returnFiles.value = "";
      renderReturnPreview();
      return imported;
    });
  }
  function open(toolId = activeToolId) {
    const tool = registry.getTool(toolId);
    if (!tool?.available) {
      setStatus(initializationHint(tool || { name: "Outer tool", path: "outer/…" }));
      return;
    }
    mirror.cancelInput();
    activeToolId = toolId;
    const frameState = frame.attach(view.frameWrap);
    if (!frameState.loaded && !frameState.loading) {
      frame.load(tool.id, tool.entry, { context: sync.getFrameContext() });
    }
    view.setOpen(true);
    mirror.refreshLayout();
    renderProvenance();
    renderUpdate();
    renderSendStage();
    renderReturnPreview();
    renderSync();
    markStage(sync.isSyncing() ? "work" : "send");
    setStatus(sync.isSyncing()
      ? "World sync on. Open the tool and it shows this world already."
      : "Port ready.");
    revalidateSync().catch((error) => setStatus(`Could not revalidate Orogen: ${error?.message || error}`));
  }

  function close() {
    view.setOpen(false);
    mirror.refreshLayout();
  }
  function revalidateSync(reload = "changed") {
    return revalidateOuterToolContext({
      portal, sync, frame, mirror, bridge, tool: activeTool(), reload,
      worldGeneration: () => worldGeneration, baseUrl: window.location.href,
      onStateChange: renderFrame,
    });
  }

  view.closeButton.addEventListener("click", close);
  view.overlay.addEventListener("click", (event) => {
    if (event.target === view.overlay) close();
  });
  view.send.addEventListener("click", () => handoffController.send());
  view.importButton.addEventListener("click", importReturned);
  view.returnFiles.addEventListener("change", renderReturnPreview);
  view.maskSelect.addEventListener("change", () => {
    userSelection.maskLayerId = view.maskSelect.value || null;
    renderSendStage();
  });
  view.heightmapSelect.addEventListener("change", () => {
    userSelection.heightmapLayerId = view.heightmapSelect.value || null;
    renderSendStage();
  });
  view.syncToggle?.addEventListener("change", async () => {
    const wanted = view.syncToggle.checked;
    const worldId = portal.activeWorldId;
    const generation = worldGeneration;
    view.syncToggle.disabled = true;
    if (wanted && !handoffController.getBlob(worldId)) {
      setStatus("Finalizing this world so the tool can open on it…");
      await handoffController.send({ openTab: false, download: false });
    }
    if (portal.activeWorldId !== worldId || generation !== worldGeneration) return;
    if (wanted && (!handoffController.getBlob(worldId) || !handoffController.getHandoff(worldId))) {
      renderSync();
      return;
    }
    busy = true;
    renderSync();
    try {
      if (wanted) {
        const handoff = handoffController.getHandoff(worldId);
        const state = await sync.enable(handoffController.getBlob(worldId), {
          worldKey: worldId,
          worldName: portal.getActiveWorld().name,
          handoffId: handoff?.handoffId,
        });
        if (!syncStateMatchesHandoff(state, {
          worldKey: worldId, handoffId: handoff?.handoffId,
          toolId: activeTool()?.id, sourceCommit: activeTool()?.commit,
        })) throw new Error(state.reason || "World sync did not accept this exact handoff.");
        await handoffController.bindCurrentRevision(worldId, generation);
      } else {
        mirror.invalidate("World sync was turned off; the Orogen mirror was cleared.");
        bridge.detach();
        await sync.disable();
      }
    } catch (error) {
      setStatus(`World sync failed: ${error?.message || error}`);
      return;
    } finally {
      busy = false;
      renderSync();
    }
    if (portal.activeWorldId !== worldId || generation !== worldGeneration) return;
    if (frame.getState().attached) {
      if (sync.isSyncing()) frame.load(activeToolId, activeTool().entry, { force: true, context: sync.getFrameContext() });
      else frame.reload(null);
    }
    setStatus(sync.isSyncing()
      ? "World sync on. The embedded tool is reloading onto this world."
      : "World sync off. The embedded tool is reloading onto its own default.");
  });
  view.reloadTool?.addEventListener("click", async () => {
    await revalidateSync(true);
    setStatus(sync.getState().reason || "Reloading the embedded tool.");
  });
  view.mirrorPlanet?.addEventListener("click", async () => {
    const world = portal.getActiveWorld();
    await sync.selectWorld({ worldKey: world.id, worldName: world.name });
    const context = frameSyncContext();
    if (!context) {
      mirror.invalidate("Mirror Planet needs a current, synced Orogen world.");
      frame.reload(sync.getFrameContext());
      return setStatus(sync.getState().reason);
    }
    close();
    const state = await mirror.start(frame.element, context);
    setStatus(state.reason);
    if (!state.connected) open();
  });
  view.checkUpdate?.addEventListener("click", async () => {
    await updateChecker.check(activeTool());
    await refreshRegistry();
  });
  view.popOut?.addEventListener("click", () => {
    if (frame.openInTab()) setStatus("Opened the tool in a separate tab. The embedded copy stays as it is.");
    else setStatus("Your browser blocked the new tab.");
  });
  view.reopen.addEventListener("click", () => showView("import"));
  view.openGenerator.addEventListener("click", () => showView("generator"));

  async function onWorldEvent(event) {
    const key = event.detail?.key;
    if (key === "activeWorldId") {
      const generation = ++worldGeneration;
      userSelection.maskLayerId = null;
      userSelection.heightmapLayerId = null;
      view.returnFiles.value = "";
      renderReturnPreview();
      mirror.invalidate("The active world changed; the previous Orogen mirror was cleared.");
      bridge.detach();
      boundFrameRevision = -1;
      if (frame.getState().attached) frame.reload(null);
      const world = portal.getActiveWorld();
      await sync.selectWorld({ worldKey: world.id, worldName: world.name });
      if (generation !== worldGeneration || portal.activeWorldId !== world.id) return;
      if (frame.getState().attached) frame.reload(sync.getFrameContext());
      renderSync();
    }
    if (["activeWorldId", "worldAssets", "worldLibrary"].includes(key) && view.isOpen()) renderSendStage();
  }
  window.addEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);

  // The tool is embedded and preloaded so it is ready whenever World Portal is,
  // but only after boot and never blocking it. A failure here leaves the rest of
  // World Portal untouched.
  function preload() {
    const tool = activeTool();
    if (!tool?.available) return;
    frame.attach(view.frameWrap);
    frame.load(tool.id, tool.entry, { context: sync.getFrameContext() });
  }

  async function refreshRegistry() {
    const previousCommit = activeTool()?.commit || null;
    const tools = await registry.load();
    renderPanel();
    const tool = tools.find((item) => item.id === activeToolId) || null;
    const commitChanged = previousCommit !== (tool?.commit || null);
    sync.adoptTool(tool);
    const validation = await revalidateSync(false);
    if (!validation.stale && (commitChanged || validation.checkoutChanged)) {
      worldGeneration += 1;
      mirror.invalidate("The pinned or checked-out Orogen revision changed; the old mirror was cleared.");
      bridge.detach();
      if (frame.getState().attached) frame.reload(sync.getFrameContext());
    }
    return tools;
  }

  registry.load().then(async (tools) => {
    renderPanel();
    sync.adoptTool(tools.find((tool) => tool.id === activeToolId) || null);
    const world = portal.getActiveWorld();
    await sync.selectWorld({ worldKey: world.id, worldName: world.name });
    const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 1200));
    idle(() => { try { preload(); } catch (error) { console.warn("Outer tool preload failed:", error); } });
  }).catch(() => renderPanel());

  return {
    open,
    close,
    registry,
    sync,
    frame,
    mirror,
    bridge,
    refresh: refreshRegistry,
    getTools: () => registry.getTools(),
    destroy() {
      forgeConnector.destroy();
      mirror.destroy();
      bridge.destroy();
      window.removeEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
      frame.destroy();
      view.overlay.remove();
    },
  };
}
