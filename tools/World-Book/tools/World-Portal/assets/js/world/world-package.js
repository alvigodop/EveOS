import { deserializeWorldAssets, serializeWorldAssets } from "./world-assets.js";
import { createDefaultCelestialBodies } from "./celestial-records.js";
import { createLayerRecord, ensureLayerAssets, markLayerCanonical, upsertLayer } from "./world-layer-store.js";

const PACKAGE_FORMAT = "world-portal-world";
const PACKAGE_VERSION = 5;

function slugify(value) {
  return String(value || "world")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "world";
}

function uniqueWorldId(name) {
  return `${slugify(name)}-${Date.now().toString(36)}`;
}

function cloneJson(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function readFileAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("World image could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = String(dataUrl).split(",", 2);
  if (!header || !encoded) throw new Error("World package image is invalid.");
  const mime = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
  if (!/;base64$/i.test(header)) throw new Error("World package image must be a base64 data URL.");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createWorldRecordFromImage(file, name, viewState = {}) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    throw new Error("Choose a PNG, JPEG, or WebP world map image.");
  }
  const worldName = String(name || file.name || "New World").replace(/\.[^.]+$/, "").trim();
  const now = new Date().toISOString();
  const record = {
    id: uniqueWorldId(worldName),
    schemaVersion: PACKAGE_VERSION,
    name: worldName || "New World",
    kind: "world",
    builtin: false,
    createdAt: now,
    updatedAt: now,
    surface: {
      textureBlob: file,
      textureName: file.name || `${slugify(worldName)}.png`,
      textureType: file.type || "image/png",
      projection: "equirectangular",
      rendering: "shared UV globe-to-flat surface",
    },
    metadata: {
      continents: [],
      countriesByContinent: {},
      countryGeography: {},
      subdivisionsByCountry: {},
      celestialBodies: createDefaultCelestialBodies(),
    },
    assets: deserializeWorldAssets(null),
    viewState: cloneJson(viewState),
  };
  ensureLayerAssets(record);
  const visual = upsertLayer(record, createLayerRecord({
    id: `${record.id}-original-visual`,
    worldId: record.id,
    blob: file,
    name: file.name || `${worldName} visual map`,
    type: "visual-map",
    category: "source",
    sourceTool: "World Portal import",
    status: "canonical",
    isCanonical: true,
  }));
  markLayerCanonical(record, visual.id);
  return record;
}

export async function exportWorldPackage(record) {
  if (!(record?.surface?.textureBlob instanceof Blob)) {
    throw new Error("This world does not have a portable map image yet.");
  }
  const imageDataUrl = await readFileAsDataUrl(record.surface.textureBlob);
  const portable = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    world: {
      ...record,
      builtin: false,
      surface: {
        ...record.surface,
        textureBlob: undefined,
        imageDataUrl,
      },
      metadata: cloneJson(record.metadata),
      assets: await serializeWorldAssets(record.assets),
      viewState: cloneJson(record.viewState),
    },
  };
  const json = JSON.stringify(portable, null, 2);
  downloadBlob(
    new Blob([json], { type: "application/json" }),
    `${slugify(record.name)}.world-portal.json`,
  );
}

export async function importWorldPackage(file, existingIds = new Set()) {
  const text = await file.text();
  let packageData;
  try {
    packageData = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (packageData?.format !== PACKAGE_FORMAT || !packageData.world) {
    throw new Error("This is not a World Portal world package.");
  }
  const source = packageData.world;
  const textureBlob = dataUrlToBlob(source.surface?.imageDataUrl);
  let id = String(source.id || uniqueWorldId(source.name));
  if (existingIds.has(id) || id === "earth") id = uniqueWorldId(source.name);
  const now = new Date().toISOString();
  return {
    ...source,
    id,
    builtin: false,
    schemaVersion: PACKAGE_VERSION,
    createdAt: source.createdAt || now,
    updatedAt: now,
    surface: {
      ...source.surface,
      imageDataUrl: undefined,
      textureBlob,
      textureType: textureBlob.type || source.surface?.textureType || "image/png",
    },
    metadata: cloneJson(source.metadata, {
      continents: [], countriesByContinent: {}, countryGeography: {}, subdivisionsByCountry: {},
    }),
    assets: deserializeWorldAssets(source.assets),
    viewState: cloneJson(source.viewState),
  };
}
