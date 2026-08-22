import { normalizeImage } from "./image-normalizer.js";
import {
  canvasToPngBlob, downloadBlob, heightmapToPngBlob, maskToPngBlob, slugify,
} from "./heightmap-exporter.js";
import { sendHeightmapToOrogen } from "./orogen-adapter.js";
import { saveActiveHeightmapAsset } from "../world/world-assets.js";
import { persistGeneratedElevation, persistGeneratedMask } from "./heightmap-generated-output.js";

export function createHeightmapForgeActions({
  portal, state, autosave, view, converterVersion, getSource,
  beginOperation, assertCurrent, ensureFullResult, reportError,
  setStatus, close, updateSidebarSummary,
}) {
  async function exportResult(kind) {
    let ticket;
    try {
      ticket = beginOperation(`export-${kind}`);
      const worldName = portal.getActiveWorld().name;
      const { result } = await ensureFullResult();
      assertCurrent(ticket);
      const mask = kind === "mask";
      const blob = mask
        ? await maskToPngBlob(result.mask, result.width, result.height)
        : await heightmapToPngBlob(result.heightmap, result.width, result.height);
      assertCurrent(ticket);
      downloadBlob(blob, `${slugify(worldName)}-${mask ? "land-mask" : "orogen-heightmap"}.png`);
      setStatus(mask ? "Binary land-mask PNG exported."
        : "Orogen-ready grayscale PNG exported with exact-black ocean pixels.");
    } catch (error) {
      reportError(error, ticket);
    }
  }

  async function saveToWorld() {
    let ticket;
    try {
      ticket = beginOperation("save-world");
      const source = getSource();
      const { result, settings } = await ensureFullResult();
      assertCurrent(ticket);
      setStatus("Saving heightmap and land mask beside the original visual map…");
      const normalized = normalizeImage(
        source, result.width, result.height, settings.normalizationMode, view.oceanColor.value,
      );
      const [heightmapBlob, landMaskBlob, normalizedVisualBlob] = await Promise.all([
        heightmapToPngBlob(result.heightmap, result.width, result.height),
        maskToPngBlob(result.mask, result.width, result.height),
        canvasToPngBlob(normalized.canvas),
      ]);
      assertCurrent(ticket);
      saveActiveHeightmapAsset(portal, state, {
        converterVersion,
        width: result.width,
        height: result.height,
        sourceWidth: source.width,
        sourceHeight: source.height,
        settings,
        validation: result.validation,
        heightmapBlob,
        landMaskBlob,
        normalizedVisualBlob,
      });
      const builtin = portal.getActiveWorld().builtin;
      if (!builtin) await portal.saveActiveWorld();
      assertCurrent(ticket);
      updateSidebarSummary();
      setStatus(builtin
        ? "Saved with the current Earth session. Export Earth as a world package to keep the derivative assets."
        : "Heightmap Forge assets saved with this world’s map and metadata.");
    } catch (error) {
      reportError(error, ticket);
    }
  }

  async function sendToOrogen() {
    let ticket;
    try {
      ticket = beginOperation("send-orogen");
      const worldName = portal.getActiveWorld().name;
      const { result, settings } = await ensureFullResult();
      assertCurrent(ticket);
      const response = await sendHeightmapToOrogen({
        grayscale: result.heightmap,
        width: result.width,
        height: result.height,
        settings,
        worldId: ticket.worldId,
        worldName,
      });
      assertCurrent(ticket);
      if (response.connected) close();
      setStatus(response.connected
        ? "Heightmap sent through the installed World Orogen adapter."
        : response.message);
    } catch (error) {
      reportError(error, ticket);
    }
  }

  async function regenerate(kind) {
    const ticket = beginOperation(`regenerate-${kind}`);
    const { result, settings } = await ensureFullResult();
    assertCurrent(ticket);
    const persist = kind === "mask" ? persistGeneratedMask : persistGeneratedElevation;
    return persist({
      portal, state, autosave, result, settings,
      assertCurrent: () => assertCurrent(ticket),
    });
  }

  return {
    exportHeightmap: () => exportResult("heightmap"),
    exportMask: () => exportResult("mask"),
    saveToWorld,
    sendToOrogen,
    regenerateMask: () => regenerate("mask"),
    regenerateElevation: () => regenerate("elevation"),
  };
}
