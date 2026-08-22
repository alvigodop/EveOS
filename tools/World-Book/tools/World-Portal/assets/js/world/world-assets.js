import { emitWorldStateChange } from "./world-events.js";
import {
  ensureLayerAssets, ensureSurfaceLayer, getCanonicalLayer, markLayerCanonical, upsertLayer,
} from "./world-layer-store.js";
import { ensureMissionAssets } from "../mission/refinement-mission-store.js";

const ASSET_SCHEMA_VERSION = 5;

function cloneJson(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return JSON.parse(JSON.stringify(fallback));
  }
}

export function blobToDataUrl(blob) {
  if (!(blob instanceof Blob)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("World asset could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  const [header, encoded] = String(dataUrl).split(",", 2);
  if (!header || !encoded) throw new Error("World asset data is invalid.");
  const mime = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

export function ensureWorldAssets(record) {
  const assets = ensureLayerAssets(record);
  assets.schemaVersion = Math.max(Number(assets.schemaVersion) || 0, ASSET_SCHEMA_VERSION);
  if (!assets.orogen || typeof assets.orogen !== "object") assets.orogen = {};
  ensureMissionAssets(record);
  return assets;
}


export function migrateWorldAssets(record) {
  const assets = ensureWorldAssets(record);
  ensureSurfaceLayer(record);
  const forge = assets.heightmapForge;
  if (!forge) return assets;
  const visual = getCanonicalLayer(record, "visual");
  const visualParents = visual ? [visual.id] : [];
  if (!forge.landMaskLayerId && forge.landMaskBlob instanceof Blob) {
    const mask = forgeLayer(record, {
      ...forge, blob: forge.landMaskBlob, parentLayerIds: visualParents,
    }, `${record.id}-forge-land-mask`, "binary-land-mask", `${record.name} Forge land mask`);
    forge.landMaskLayerId = mask.id;
    if (!getCanonicalLayer(record, "mask")) markLayerCanonical(record, mask.id);
  }
  if (!forge.heightmapLayerId && forge.heightmapBlob instanceof Blob) {
    const parents = forge.landMaskLayerId ? [forge.landMaskLayerId] : visualParents;
    const height = forgeLayer(record, {
      ...forge, blob: forge.heightmapBlob, parentLayerIds: parents,
    }, `${record.id}-forge-heightmap`, "procedural-heightmap", `${record.name} Forge heightmap`);
    forge.heightmapLayerId = height.id;
    if (!getCanonicalLayer(record, "heightmap")) markLayerCanonical(record, height.id);
  }
  return assets;
}

export function getActiveHeightmapAsset(portal) {
  return ensureWorldAssets(portal.getActiveRecord()).heightmapForge || null;
}

function forgeLayer(record, source, id, type, name) {
  return upsertLayer(record, {
    id,
    blob: source.blob,
    name,
    type,
    category: "source",
    sourceTool: "Heightmap Forge",
    sourceVersion: source.converterVersion,
    width: source.width,
    height: source.height,
    parentLayerIds: source.parentLayerIds || [],
    status: "accepted",
    analysis: source.validation || null,
  });
}

export function saveActiveHeightmapAsset(portal, state, asset) {
  const record = portal.getActiveRecord();
  const assets = ensureWorldAssets(record);
  const parentVisual = getCanonicalLayer(record, "visual");
  const parentLayerIds = parentVisual ? [parentVisual.id] : [];
  let normalizedVisualLayer = null;
  if (asset.normalizedVisualBlob instanceof Blob) {
    normalizedVisualLayer = upsertLayer(record, {
      id: `${record.id}-forge-normalized-visual`,
      blob: asset.normalizedVisualBlob,
      name: `${record.name} normalized visual map`,
      type: "normalized-visual-map", category: "source",
      sourceTool: "Heightmap Forge", sourceVersion: asset.converterVersion,
      width: asset.width, height: asset.height, parentLayerIds, status: "accepted",
    });
  }
  const maskParents = normalizedVisualLayer ? [normalizedVisualLayer.id] : parentLayerIds;
  const maskLayer = forgeLayer(record, {
    ...asset, blob: asset.landMaskBlob, parentLayerIds: maskParents,
  }, `${record.id}-forge-land-mask`, "binary-land-mask", `${record.name} Forge land mask`);
  const heightLayer = forgeLayer(record, {
    ...asset, blob: asset.heightmapBlob, parentLayerIds: [maskLayer.id],
  }, `${record.id}-forge-heightmap`, "procedural-heightmap", `${record.name} Forge heightmap`);
  if (!getCanonicalLayer(record, "mask")) markLayerCanonical(record, maskLayer.id);
  if (!getCanonicalLayer(record, "heightmap")) markLayerCanonical(record, heightLayer.id);
  const { normalizedVisualBlob: _normalizedVisualBlob, ...assetMetadata } = asset;
  assets.heightmapForge = {
    ...(assets.heightmapForge || {}),
    ...assetMetadata,
    normalizedVisualLayerId: normalizedVisualLayer?.id || null,
    landMaskLayerId: maskLayer.id,
    heightmapLayerId: heightLayer.id,
    updatedAt: new Date().toISOString(),
  };
  portal.updateActiveViewState(state);
  emitWorldStateChange("worldAssets", portal.activeWorldId, {
    world: portal.getActiveWorld(), asset: "heightmapForge",
  });
  return assets.heightmapForge;
}

async function serializeLayer(layer) {
  return {
    ...cloneJson(layer),
    blobDataUrl: await blobToDataUrl(layer.blob),
    blob: undefined,
  };
}

function deserializeLayer(layer) {
  return {
    ...cloneJson(layer),
    blob: dataUrlToBlob(layer.blobDataUrl),
    blobDataUrl: undefined,
  };
}

export async function serializeWorldAssets(source) {
  if (!source || typeof source !== "object") return undefined;
  const assets = cloneJson(source);
  assets.layers = await Promise.all((source.layers || []).map(serializeLayer));
  const forge = source.heightmapForge;
  if (forge) {
    assets.heightmapForge = {
      ...cloneJson(forge),
      landMaskDataUrl: forge.landMaskLayerId ? null : await blobToDataUrl(forge.landMaskBlob),
      heightmapDataUrl: forge.heightmapLayerId ? null : await blobToDataUrl(forge.heightmapBlob),
    };
    delete assets.heightmapForge.landMaskBlob;
    delete assets.heightmapForge.heightmapBlob;
  }
  return assets;
}

export function deserializeWorldAssets(source) {
  const assets = cloneJson(source, {});
  assets.layers = (source?.layers || []).map(deserializeLayer);
  const forge = source?.heightmapForge;
  if (forge) {
    const maskLayer = assets.layers.find((layer) => layer.id === forge.landMaskLayerId);
    const heightLayer = assets.layers.find((layer) => layer.id === forge.heightmapLayerId);
    assets.heightmapForge = {
      ...cloneJson(forge),
      landMaskBlob: maskLayer?.blob || dataUrlToBlob(forge.landMaskDataUrl),
      heightmapBlob: heightLayer?.blob || dataUrlToBlob(forge.heightmapDataUrl),
    };
    delete assets.heightmapForge.landMaskDataUrl;
    delete assets.heightmapForge.heightmapDataUrl;
  }
  assets.schemaVersion = Math.max(Number(assets.schemaVersion) || 0, ASSET_SCHEMA_VERSION);
  assets.orogen = assets.orogen || {};
  const holder = { assets };
  ensureLayerAssets(holder);
  return holder.assets;
}

export function describeHeightmapAsset(portal) {
  const asset = getActiveHeightmapAsset(portal);
  if (!asset) return "No Orogen-ready heightmap saved for this world.";
  const width = asset.width || asset.targetWidth;
  const height = asset.height || asset.targetHeight;
  const ready = asset.validation?.orogenReady ? "Orogen Ready" : "Needs validation";
  return `${ready} · ${width || "?"} × ${height || "?"} · converter ${asset.converterVersion || "unknown"}`;
}
