import {
  ensureLayerAssets, getCanonicalLayer, getLayer, upsertLayer,
} from "../world/world-layer-store.js";
import { emitWorldStateChange } from "../world/world-events.js";
import { checksumBlob } from "../refinement/image-layer-utils.js";
import { heightmapToPngBlob, maskToPngBlob } from "./heightmap-exporter.js";

const FORGE_OUTPUT_VERSION = "1.1.0";

function generationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function settingsFingerprint(settings) {
  return JSON.stringify(settings);
}

function rememberGenerated(assets, kind, layer, fingerprint) {
  const forge = assets.heightmapForge || (assets.heightmapForge = {});
  const key = kind === "mask" ? "latestGeneratedMaskLayerId" : "latestGeneratedHeightmapLayerId";
  forge[key] = layer.id;
  forge.latestGeneratedAt = layer.createdAt;
  forge.latestGenerationFingerprint = fingerprint;
  forge.generatedOutputLayerIds = [...new Set([...(forge.generatedOutputLayerIds || []), layer.id])].slice(-50);
}

async function persistLayer({
  portal, state, autosave, result, settings, kind, parentLayerIds = [],
  assertCurrent = () => {},
}) {
  assertCurrent();
  const record = portal.getActiveRecord();
  const assets = ensureLayerAssets(record);
  const id = generationId();
  const isMask = kind === "mask";
  const blob = isMask
    ? await maskToPngBlob(result.mask, result.width, result.height)
    : await heightmapToPngBlob(result.heightmap, result.width, result.height);
  assertCurrent();
  const checksum = await checksumBlob(blob);
  assertCurrent();
  const layer = upsertLayer(record, {
    id: `${record.id}-forge-generated-${kind}-${id}`,
    blob,
    name: `${record.name} generated ${isMask ? "land mask" : "heightmap"}`,
    type: isMask ? "binary-land-mask" : "procedural-heightmap",
    category: "derived",
    sourceTool: "Heightmap Forge",
    sourceVersion: FORGE_OUTPUT_VERSION,
    width: result.width,
    height: result.height,
    parentLayerIds,
    status: "generated",
    checksum,
    analysis: result.validation || null,
    metadata: {
      generatedOutput: true,
      generationFingerprint: settingsFingerprint(settings),
      settings,
      generatedAt: new Date().toISOString(),
    },
  });
  rememberGenerated(assets, kind, layer, settingsFingerprint(settings));
  portal.updateActiveViewState(state);
  emitWorldStateChange("worldAssets", portal.activeWorldId, { reason: `forge-generated-${kind}`, layerId: layer.id });
  if (autosave) await autosave.flush(`Generated ${kind} saved`);
  else if (!record.builtin) await portal.saveActiveWorld();
  assertCurrent();
  return layer;
}

export async function persistGeneratedMask(context) {
  const parent = getCanonicalLayer(context.portal.getActiveRecord(), "visual");
  const layer = await persistLayer({
    ...context,
    kind: "mask",
    parentLayerIds: parent ? [parent.id] : [],
  });
  return { generatedLayerId: layer.id, generatedMaskLayerId: layer.id, width: layer.width, height: layer.height };
}

export async function persistGeneratedElevation(context) {
  context.assertCurrent?.();
  const record = context.portal.getActiveRecord();
  const assets = ensureLayerAssets(record);
  const fingerprint = settingsFingerprint(context.settings);
  let maskLayer = getLayer(record, assets.heightmapForge?.latestGeneratedMaskLayerId);
  if (!maskLayer || maskLayer.metadata?.generationFingerprint !== fingerprint) {
    const generated = await persistGeneratedMask(context);
    context.assertCurrent?.();
    maskLayer = getLayer(record, generated.generatedLayerId);
  }
  const layer = await persistLayer({
    ...context,
    kind: "heightmap",
    parentLayerIds: maskLayer ? [maskLayer.id] : [],
  });
  context.assertCurrent?.();
  return {
    generatedLayerId: layer.id,
    generatedHeightmapLayerId: layer.id,
    generatedMaskLayerId: maskLayer?.id || null,
    width: layer.width,
    height: layer.height,
  };
}
