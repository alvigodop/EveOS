const LAYER_SCHEMA_VERSION = 6;
const VISUAL_TYPES = new Set(["visual-map", "normalized-visual-map", "satellite", "terrain"]);
const MASK_TYPES = new Set(["binary-land-mask", "orogen-land-mask", "repaired-mask"]);
const HEIGHT_TYPES = new Set([
  "procedural-heightmap", "orogen-land-heightmap", "composite-heightmap",
]);

function slugify(value) {
  return String(value || "layer").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "layer";
}

function uniqueId(prefix = "layer") {
  return `${slugify(prefix)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ensureLayerAssets(record) {
  if (!record.assets || typeof record.assets !== "object") record.assets = {};
  const assets = record.assets;
  assets.layerSchemaVersion = Math.max(Number(assets.layerSchemaVersion) || 0, LAYER_SCHEMA_VERSION);
  if (!Array.isArray(assets.layers)) assets.layers = [];
  if (!Array.isArray(assets.analysisSessions)) assets.analysisSessions = [];
  if (!Array.isArray(assets.refinementPasses)) assets.refinementPasses = [];
  if (!assets.canonical || typeof assets.canonical !== "object") assets.canonical = {};
  if (!assets.eveBridge || typeof assets.eveBridge !== "object") {
    assets.eveBridge = { protocolVersion: 1, executions: [] };
  }
  if (!Array.isArray(assets.eveBridge.executions)) assets.eveBridge.executions = [];
  if (!assets.orogen || typeof assets.orogen !== "object") assets.orogen = {};
  if (!Array.isArray(assets.orogen.exportAudits)) assets.orogen.exportAudits = [];
  if (!assets.labIntelligence || typeof assets.labIntelligence !== "object") assets.labIntelligence = {};
  return assets;
}

export function layerDomain(type) {
  if (VISUAL_TYPES.has(type)) return "visual";
  if (MASK_TYPES.has(type)) return "mask";
  if (HEIGHT_TYPES.has(type)) return "heightmap";
  return "analysis";
}


export function inferLayerRole(filename) {
  const name = String(filename || "").toLowerCase();
  const checks = [
    [/land[-_ ]?heightmap/, "orogen-land-heightmap", 0.99, "filename contains land-heightmap"],
    [/land[-_ ]?mask/, "orogen-land-mask", 0.99, "filename contains land-mask"],
    [/satellite/, "satellite", 0.98, "filename contains satellite"],
    [/climate/, "climate", 0.98, "filename contains climate"],
    [/biome/, "biome", 0.98, "filename contains biome"],
    [/terrain|relief/, "terrain", 0.90, "filename contains terrain or relief"],
    [/class|zone|koppen/, "classified-regions", 0.88, "filename suggests a classified raster"],
    [/heightmap/, "procedural-heightmap", 0.82, "filename contains heightmap"],
    [/visual|texture|map/, "visual-map", 0.65, "filename suggests a visual map"],
  ];
  const match = checks.find(([pattern]) => pattern.test(name));
  return match
    ? { type: match[1], confidence: match[2], reason: match[3] }
    : { type: "custom", confidence: 0.20, reason: "no known filename pattern matched" };
}
export function inferLayerType(filename) {
  return inferLayerRole(filename).type;
}

export function inferPassToken(filename) {
  return String(filename || "").match(/(?:^|[-_])(\d{5,})(?:\D|$)/)?.[1] || null;
}

export function createLayerRecord(options = {}) {
  const now = new Date().toISOString();
  const type = options.type || inferLayerType(options.name || options.blob?.name);
  return {
    id: options.id || uniqueId(type),
    worldId: options.worldId || null,
    sessionId: options.sessionId || null,
    passId: options.passId || null,
    name: String(options.name || options.blob?.name || "Untitled layer"),
    type,
    category: options.category || (type === "visual-map" ? "source" : "derived"),
    sourceTool: options.sourceTool || "World Portal",
    sourceVersion: options.sourceVersion || null,
    sourceRepository: options.sourceRepository || null,
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now,
    parentLayerIds: [...(options.parentLayerIds || [])],
    width: Number(options.width) || null,
    height: Number(options.height) || null,
    projection: options.projection || "equirectangular",
    fileFormat: options.fileFormat || options.blob?.type || "image/png",
    mimeType: options.mimeType || options.blob?.type || "image/png",
    filename: options.filename || options.blob?.name || null,
    byteSize: Number(options.byteSize ?? options.blob?.size) || 0,
    lastModified: Number(options.lastModified ?? options.blob?.lastModified) || null,
    checksum: options.checksum || null,
    roleInference: options.roleInference || null,
    analysisVersion: options.analysisVersion || null,
    metadata: options.metadata && typeof options.metadata === "object" ? options.metadata : {},
    status: options.status || "provisional",
    notes: String(options.notes || ""),
    settingsIncomplete: options.settingsIncomplete ?? false,
    analysis: options.analysis || null,
    isCanonical: !!options.isCanonical,
    blob: options.blob || null,
  };
}

export function createAnalysisSession(record, options = {}) {
  const assets = ensureLayerAssets(record);
  const session = {
    id: options.id || uniqueId("orogen-session"),
    worldId: record.id,
    name: String(options.name || `Orogen analysis ${assets.analysisSessions.length + 1}`),
    tool: options.tool || "World Orogen",
    sourceRepository: options.sourceRepository
      || "https://github.com/raguilar011095/planet_heightmap_generation",
    sourceVersion: options.sourceVersion || null,
    createdAt: options.createdAt || new Date().toISOString(),
    inputLayerIds: [...(options.inputLayerIds || [])],
    outputLayerIds: [...(options.outputLayerIds || [])],
    notes: String(options.notes || ""),
    settingsSummary: options.settingsSummary || {},
    settingsIncomplete: options.settingsIncomplete ?? true,
    passToken: options.passToken || null,
    missionId: options.missionId || null,
    missionPassId: options.missionPassId || null,
    expectedBaselineId: options.expectedBaselineId || null,
    status: options.status || "provisional",
  };
  assets.analysisSessions.push(session);
  return session;
}

export function createRefinementPass(record, options = {}) {
  const assets = ensureLayerAssets(record);
  const pass = {
    id: options.id || uniqueId("refinement-pass"),
    worldId: record.id,
    sessionId: options.sessionId || null,
    missionId: options.missionId || null,
    missionPassId: options.missionPassId || null,
    parentPassId: options.parentPassId || null,
    name: String(options.name || `Refinement pass ${assets.refinementPasses.length + 1}`),
    createdAt: options.createdAt || new Date().toISOString(),
    inputLayerIds: [...(options.inputLayerIds || [])],
    outputLayerIds: [...(options.outputLayerIds || [])],
    settings: options.settings || {},
    validation: options.validation || null,
    notes: String(options.notes || ""),
    status: options.status || "provisional",
  };
  assets.refinementPasses.push(pass);
  return pass;
}

export function upsertLayer(record, source) {
  const assets = ensureLayerAssets(record);
  const layer = createLayerRecord({ ...source, worldId: record.id });
  const index = assets.layers.findIndex((item) => item.id === layer.id);
  if (index >= 0) assets.layers[index] = layer;
  else assets.layers.push(layer);
  return layer;
}

export function getLayer(record, layerId) {
  return ensureLayerAssets(record).layers.find((layer) => layer.id === layerId) || null;
}

export function removeLayer(record, layerId) {
  const assets = ensureLayerAssets(record);
  const index = assets.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return false;
  assets.layers.splice(index, 1);
  for (const session of assets.analysisSessions) {
    session.inputLayerIds = session.inputLayerIds.filter((id) => id !== layerId);
    session.outputLayerIds = session.outputLayerIds.filter((id) => id !== layerId);
  }
  for (const pass of assets.refinementPasses) {
    pass.inputLayerIds = pass.inputLayerIds.filter((id) => id !== layerId);
    pass.outputLayerIds = pass.outputLayerIds.filter((id) => id !== layerId);
  }
  for (const [key, value] of Object.entries(assets.canonical)) {
    if (value === layerId) delete assets.canonical[key];
  }
  return true;
}

export function markLayerCanonical(record, layerId) {
  const assets = ensureLayerAssets(record);
  const layer = getLayer(record, layerId);
  if (!layer) throw new Error("Layer is not owned by the active world.");
  const domain = layerDomain(layer.type);
  const key = `${domain}LayerId`;
  for (const item of assets.layers) {
    if (layerDomain(item.type) !== domain) continue;
    item.isCanonical = item.id === layerId;
    if (!item.isCanonical && item.status === "canonical") item.status = "accepted";
  }
  assets.canonical[key] = layerId;
  layer.status = "canonical";
  layer.updatedAt = new Date().toISOString();
  return layer;
}

export function getCanonicalLayer(record, domain) {
  const assets = ensureLayerAssets(record);
  const id = assets.canonical?.[`${domain}LayerId`];
  return getLayer(record, id) || assets.layers.find((layer) => (
    layer.isCanonical && layerDomain(layer.type) === domain
  )) || null;
}

export function attachLayerToSession(record, sessionId, layerId, role = "output") {
  const session = ensureLayerAssets(record).analysisSessions.find((item) => item.id === sessionId);
  if (!session) return null;
  const key = role === "input" ? "inputLayerIds" : "outputLayerIds";
  if (!session[key].includes(layerId)) session[key].push(layerId);
  return session;
}

export function ensureSurfaceLayer(record) {
  const assets = ensureLayerAssets(record);
  let layer = getCanonicalLayer(record, "visual")
    || assets.layers.find((item) => layerDomain(item.type) === "visual");
  if (layer && !getCanonicalLayer(record, "visual")) markLayerCanonical(record, layer.id);
  if (!layer && record.surface?.textureBlob instanceof Blob) {
    layer = upsertLayer(record, createLayerRecord({
      id: `${record.id}-original-visual`,
      blob: record.surface.textureBlob,
      name: record.surface.textureName || `${record.name} visual map`,
      filename: record.surface.textureName,
      type: "visual-map",
      category: "source",
      sourceTool: "World Portal migration",
      width: record.surface.width,
      height: record.surface.height,
      status: "canonical",
      isCanonical: true,
    }));
    markLayerCanonical(record, layer.id);
  }
  return layer || null;
}

export function describeLayer(layer) {
  if (!layer) return "No layer selected";
  const size = layer.width && layer.height ? `${layer.width} × ${layer.height}` : "size unknown";
  return `${layer.type} · ${size} · ${layer.status || "provisional"}`;
}
