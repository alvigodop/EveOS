import { ensureLayerAssets, getLayer } from "../world/world-layer-store.js";
import { checksumBlob } from "../refinement/image-layer-utils.js";
import { buildHandoffManifest, buildReturnProvenance } from "./orogen-port-adapter.js";
import { syncStateMatchesHandoff } from "./outer-tool-sync.js";

function filename(name) {
  return `${String(name || "world").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.orogen-handoff.json`;
}

export function createOrogenHandoffController({
  portal, orogenLab, autosave, sync, frame, view, getTool, getPair,
  downloadJson, setStatus, onBusyChange, openTool, markStage, openPort,
  getWorldGeneration = () => 0,
}) {
  const blobs = new Map();
  const handoffs = new Map();
  let busy = false;

  function setBusy(value) {
    busy = value;
    onBusyChange?.(value);
  }

  function assertActive(worldId, generation) {
    if (portal.activeWorldId !== worldId || getWorldGeneration() !== generation) {
      throw new Error("The active world changed; the Orogen operation was cancelled.");
    }
  }

  function persistHandoff(record, handoff) {
    const assets = ensureLayerAssets(record);
    if (!Array.isArray(assets.orogen.handoffs)) assets.orogen.handoffs = [];
    const stored = JSON.parse(JSON.stringify(handoff));
    const index = assets.orogen.handoffs.findIndex((item) => item.handoffId === handoff.handoffId);
    if (index >= 0) assets.orogen.handoffs[index] = stored;
    else assets.orogen.handoffs.push(stored);
    if (assets.orogen.handoffs.length > 24) assets.orogen.handoffs.splice(0, assets.orogen.handoffs.length - 24);
    assets.orogen.currentHandoffId = handoff.handoffId;
    return handoff;
  }

  function bindRevision(record, handoff) {
    const context = sync.getFrameContext();
    if (context?.worldKey === handoff.world.id && context.handoffId === handoff.handoffId) {
      handoff.bridge.worldRevision = context.revision;
    }
    return persistHandoff(record, handoff);
  }

  function createHandoff(
    record, tool, pair, finalization = null, handoffId = undefined, persist = true,
  ) {
    const handoff = buildHandoffManifest({
      record, tool, pair, finalization, handoffId, syncContext: sync.getFrameContext(),
    });
    if (persist) {
      handoffs.set(record.id, handoff);
      persistHandoff(record, handoff);
    }
    return handoff;
  }

  async function send({ openTab = true, download = null } = {}) {
    const tool = getTool();
    const record = portal.getActiveRecord();
    const pair = getPair();
    if (!tool || !record || busy) return null;
    if (!pair?.ready) {
      setStatus(pair?.problems?.join(" ") || "No Orogen-ready pair is available.");
      return null;
    }
    const worldId = record.id;
    const worldName = record.name;
    const generation = getWorldGeneration();
    const wantsDownload = download === null ? Boolean(view.downloadFiles?.checked) : download;
    setBusy(true);
    setStatus(wantsDownload ? "Finalizing and exporting the pair…" : "Finalizing the pair…");
    try {
      const options = {
        maskLayerId: pair.mask.id,
        heightmapLayerId: pair.heightmap.id,
        assertCurrent: () => assertActive(worldId, generation),
      };
      const finalization = wantsDownload
        ? await orogenLab.exportInputSet(options)
        : await orogenLab.finalizeInput(options);
      assertActive(worldId, generation);
      if (finalization?.files?.heightmap?.filename) view.sentFile.textContent = finalization.files.heightmap.filename;
      const finalId = finalization?.generatedOutputLayerIds?.heightmapLayerId
        || finalization?.finalHeightmapLayerId;
      const finalLayer = finalId ? getLayer(record, finalId) : null;
      if (!(finalLayer?.blob instanceof Blob)) throw new Error("The finalized heightmap bytes are unavailable.");
      blobs.set(worldId, finalLayer.blob);
      const handoff = createHandoff(record, tool, pair, finalization);
      if (sync.isSyncing()) {
        const state = await sync.enable(finalLayer.blob, { worldKey: worldId, worldName, handoffId: handoff.handoffId });
        assertActive(worldId, generation);
        if (!syncStateMatchesHandoff(state, {
          worldKey: worldId, handoffId: handoff.handoffId,
          toolId: tool.id, sourceCommit: tool.commit,
        })) throw new Error(state.reason || "World sync did not accept this exact handoff.");
        bindRevision(record, handoff);
        if (frame.getState().attached) frame.reload(sync.getFrameContext());
      }
      if (wantsDownload) downloadJson(handoff, filename(worldName));
      await autosave?.flush?.("Outer tool handoff recorded");
      assertActive(worldId, generation);
      if (!openTab) return { finalization, handoff };
      openTool(tool.entry);
      markStage("work");
      if (sync.isSyncing()) {
        setStatus("Sent. Orogen is reloading onto this exact world revision; no file picker is needed.");
      } else {
        const sent = finalization?.files?.heightmap?.filename || "the heightmap";
        setStatus(wantsDownload
          ? `Sent. Choose ${sent} in Orogen and click its Import button.`
          : "Finalized, but World sync is off and no file was downloaded. Enable sync or download the pair.");
      }
      return { finalization, handoff };
    } catch (error) {
      const message = String(error?.message || error);
      setStatus(/cancelled by user/i.test(message) ? "Send cancelled at the download confirmation." : `Send failed: ${message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function handoffForCurrentWorld() {
    const record = portal.getActiveRecord();
    const tool = getTool();
    const assets = ensureLayerAssets(record);
    const stored = Array.isArray(assets.orogen.handoffs) ? assets.orogen.handoffs : [];
    const matches = (item) => item?.world?.id === record.id
      && item?.ownership?.toolId === tool?.id
      && item?.ownership?.sourceCommit === tool?.commit?.toLowerCase();
    const context = sync.getFrameContext();
    const memory = handoffs.get(record.id);
    let handoff = context
      ? ([memory, ...stored].find((item) => item?.handoffId === context.handoffId && matches(item)) || null)
      : ((matches(memory) ? memory : null)
        || stored.find((item) => item.handoffId === assets.orogen.currentHandoffId && matches(item))
        || [...stored].reverse().find(matches)
        || null);
    if (handoff && context) bindRevision(record, handoff);
    if (handoff) handoffs.set(record.id, handoff);
    if (!handoff && context?.worldKey === record.id && context.handoffId) {
      const unknownPair = { mask: null, heightmap: null, usedOverride: false, usingCanonical: false };
      handoff = createHandoff(record, tool, unknownPair, null, context.handoffId);
      handoff.provenanceIncomplete = true;
      bindRevision(record, handoff);
    }
    return handoff;
  }

  async function importReturned(files) {
    if (!files?.length || busy) return null;
    const record = portal.getActiveRecord();
    const worldId = record.id;
    const generation = getWorldGeneration();
    const tool = getTool();
    setBusy(true);
    setStatus(`Importing ${files.length} file${files.length === 1 ? "" : "s"} as evidence…`);
    try {
      const handoff = handoffForCurrentWorld();
      if (!handoff) throw new Error("Send or sync this world before importing Orogen returns.");
      if (handoff.provenanceIncomplete) throw new Error("The persisted handoff is incomplete; resend this world before intake.");
      const provenance = buildReturnProvenance({ handoff, worldId, tool });
      const imported = await orogenLab.importSessionFiles(files, {
        sourceVersion: provenance.sourceCommit,
        provenance,
        expectedWorldId: worldId,
        isWorldCurrent: (expected) => portal.activeWorldId === expected && getWorldGeneration() === generation,
        inputLayerIds: provenance.inputLayerIds,
      });
      assertActive(worldId, generation);
      if (!imported) throw new Error("Orogen Lab is busy; no returned files were imported.");
      await autosave?.flush?.("Outer tool results imported");
      setStatus(`Imported ${files.length} file${files.length === 1 ? "" : "s"} with handoff ${provenance.handoffId}.`);
      return imported;
    } catch (error) {
      setStatus(`Import failed: ${error?.message || error}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function receiveForgeHeightmap(payload) {
    const record = portal.getActiveRecord();
    const generation = getWorldGeneration();
    const tool = getTool();
    if (payload.worldId !== record.id) throw new Error("Forge heightmap belongs to a different world.");
    if (!tool?.available) throw new Error("World Orogen is not initialized.");
    const payloadSha256 = await checksumBlob(payload.blob);
    assertActive(record.id, generation);
    const forgePair = { mask: null, heightmap: null, usedOverride: false, usingCanonical: false };
    const handoff = createHandoff(record, tool, forgePair, {
      width: payload.width,
      height: payload.height,
      sourceMode: "heightmap-forge-live-payload",
      payloadProvenance: {
        kind: "grayscale-heightmap",
        mimeType: payload.blob.type || "image/png",
        byteSize: payload.blob.size,
        sha256: payloadSha256,
        width: payload.width,
        height: payload.height,
        settings: payload.settings || null,
      },
    }, undefined, false);
    blobs.set(record.id, payload.blob);
    const state = await sync.enable(payload.blob, {
      worldKey: record.id, worldName: record.name, handoffId: handoff.handoffId,
    });
    assertActive(record.id, generation);
    if (!syncStateMatchesHandoff(state, {
      worldKey: record.id, handoffId: handoff.handoffId,
      toolId: tool.id, sourceCommit: tool.commit,
    })) throw new Error(state.reason || "Forge heightmap did not win its exact sync operation.");
    handoffs.set(record.id, handoff);
    bindRevision(record, handoff);
    await autosave?.flush?.("Forge Orogen handoff recorded");
    assertActive(record.id, generation);
    openTool(tool.entry);
    openPort(tool.id);
    setStatus("Forge heightmap synced to Orogen. Open the embedded tool to refine it; Mirror Planet is now available.");
    return { synced: true, handoffId: handoff.handoffId };
  }

  return {
    send, importReturned, receiveForgeHeightmap,
    getBlob: (worldId) => blobs.get(worldId) || null,
    getHandoff: (worldId) => handoffs.get(worldId) || null,
    async bindCurrentRevision(worldId, generation = getWorldGeneration()) {
      const record = portal.getActiveRecord();
      const handoff = handoffs.get(worldId);
      if (record.id !== worldId || !handoff) return null;
      assertActive(worldId, generation);
      const result = bindRevision(record, handoff);
      await autosave?.flush?.("Orogen sync revision recorded");
      assertActive(worldId, generation);
      return result;
    },
    isBusy: () => busy,
  };
}
