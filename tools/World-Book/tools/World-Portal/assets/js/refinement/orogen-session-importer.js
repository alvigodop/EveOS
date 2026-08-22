import {
  attachLayerToSession, createAnalysisSession, createLayerRecord, createRefinementPass,
  ensureLayerAssets, inferLayerRole, inferPassToken, upsertLayer,
} from "../world/world-layer-store.js";
import { checksumBlob, readImageBlob } from "./image-layer-utils.js";
import { extractImageContainerMetadata } from "./image-container-metadata.js";

const OROGEN_REPOSITORY = "https://github.com/raguilar011095/planet_heightmap_generation";

function statusFromAnalysis(analysis) {
  return analysis?.anomaly || analysis?.anomalyFlags?.length ? "provisional" : "generated";
}

function refineRoleFromPixels(layer) {
  const hints = layer.analysis?.analysisHints || [];
  layer.roleInference = { ...(layer.roleInference || {}), pixelHints: hints };
  if ((layer.roleInference.confidence || 0) >= 0.8) return;
  if (hints.includes("likely-binary-mask")) {
    layer.type = "orogen-land-mask";
    layer.roleInference = { type: layer.type, confidence: 0.86, reason: "pixel structure resembles a binary mask", pixelHints: hints };
  } else if (hints.includes("likely-grayscale-heightmap")) {
    layer.type = "orogen-land-heightmap";
    layer.roleInference = { type: layer.type, confidence: 0.78, reason: "pixel structure resembles a grayscale heightmap", pixelHints: hints };
  }
}

export async function importOrogenSession({
  record, files, name, notes, sourceVersion, missionId = null, missionPassId = null,
  inputLayerIds = [], expectedBaselineId = null, expectedBaseline = null, engine, onProgress,
  provenance = null, expectedWorldId = null, isWorldCurrent = null,
}) {
  if (!files?.length) throw new Error("Choose one or more Orogen image exports.");
  const worldId = String(expectedWorldId || provenance?.worldId || record?.id || "");
  const pinnedCommit = String(sourceVersion || "").toLowerCase() || null;
  const normalizedProvenance = provenance ? {
    format: provenance.format,
    version: provenance.version,
    handoffId: provenance.handoffId,
    worldId: provenance.worldId,
    worldName: provenance.worldName,
    toolId: provenance.toolId,
    sourceCommit: String(provenance.sourceCommit || "").toLowerCase(),
    sourceRepository: provenance.sourceRepository,
    bridgeProtocol: provenance.bridgeProtocol,
    bridgeProtocolVersion: provenance.bridgeProtocolVersion,
    worldRevision: provenance.worldRevision,
    inputMode: provenance.inputMode || null,
    inputPayload: provenance.inputPayload
      ? JSON.parse(JSON.stringify(provenance.inputPayload)) : null,
  } : null;
  function assertWorld() {
    if (!worldId || record?.id !== worldId || (isWorldCurrent && !isWorldCurrent(worldId))) {
      throw new Error("The active world changed; Orogen intake was refused.");
    }
    if (normalizedProvenance && (normalizedProvenance.worldId !== worldId
      || normalizedProvenance.toolId !== "orogen"
      || normalizedProvenance.sourceCommit !== pinnedCommit
      || !normalizedProvenance.handoffId)) {
      throw new Error("Orogen return provenance does not match this world and pinned checkout.");
    }
  }
  assertWorld();
  const assets = ensureLayerAssets(record);
  const addedLayerIds = [];
  const addedSessionIds = [];
  const addedPassIds = [];
  try {
  const tokens = [...new Set([...files].map((file) => inferPassToken(file.name)).filter(Boolean))];
  const session = createAnalysisSession(record, {
    name: name || `${record.name} Orogen pass ${record.assets.analysisSessions.length + 1}`,
    notes,
    sourceRepository: OROGEN_REPOSITORY,
    sourceVersion: sourceVersion || null,
    passToken: tokens.length === 1 ? tokens[0] : null,
    settingsSummary: {
      status: "Settings incomplete", importedFiles: files.length, expectedBaseline,
      orogenProvenance: normalizedProvenance,
    },
    settingsIncomplete: true, missionId, missionPassId, inputLayerIds, expectedBaselineId,
  });
  session.orogenProvenance = normalizedProvenance;
  addedSessionIds.push(session.id);
  const layers = [];
  for (let index = 0; index < files.length; index += 1) {
    assertWorld();
    const file = files[index];
    onProgress?.(index / files.length, `Reading ${file.name}`);
    const image = await readImageBlob(file);
    const imageContainer = await extractImageContainerMetadata(file);
    const checksum = await checksumBlob(file);
    assertWorld();
    const roleInference = inferLayerRole(file.name);
    const type = roleInference.type;
    const layer = upsertLayer(record, createLayerRecord({
      blob: file,
      name: file.name,
      filename: file.name,
      type,
      category: "derived",
      sourceTool: "World Orogen",
      sourceRepository: OROGEN_REPOSITORY,
      sourceVersion: sourceVersion || null,
      sessionId: session.id,
      width: image.width,
      height: image.height,
      checksum,
      byteSize: file.size,
      lastModified: file.lastModified,
      mimeType: file.type,
      roleInference,
      metadata: { imageContainer, missionId, missionPassId, orogenProvenance: normalizedProvenance },
      analysisVersion: "2.0.0",
      passId: inferPassToken(file.name),
      settingsIncomplete: true,
      notes: "Imported from World Orogen. Generation settings were not embedded in the image.",
    }));
    addedLayerIds.push(layer.id);
    try {
      layer.analysis = await engine.analyze(layer);
      assertWorld();
      layer.analysis.file = {
        byteSize: layer.byteSize,
        mimeType: layer.mimeType,
        lastModified: layer.lastModified,
        checksum: layer.checksum,
        imageContainer,
      };
      refineRoleFromPixels(layer);
      layer.status = statusFromAnalysis(layer.analysis);
      if (layer.analysis?.anomaly) layer.notes += ` ${layer.analysis.anomaly}`;
    } catch (error) {
      layer.analysis = { error: error?.message || String(error) };
    }
    assertWorld();
    attachLayerToSession(record, session.id, layer.id, "output");
    layers.push(layer);
    onProgress?.((index + 1) / files.length, `Imported ${file.name}`);
  }
  const passGroups = new Map();
  for (const layer of layers) {
    const token = layer.passId || session.passToken || "imported";
    if (!passGroups.has(token)) passGroups.set(token, []);
    passGroups.get(token).push(layer);
  }
  const passes = [];
  for (const [token, passLayers] of passGroups) {
    assertWorld();
    const pass = createRefinementPass(record, {
      sessionId: session.id,
      name: token === "imported" ? `${session.name} imported run` : `${session.name} · Orogen run ${token}`,
      outputLayerIds: passLayers.map((layer) => layer.id),
      settings: {
        sourceTool: "World Orogen", sourceVersion: sourceVersion || null,
        settingsIncomplete: true, passToken: token, orogenProvenance: normalizedProvenance,
      },
      notes: "Imported Orogen output lineage. Generation settings were not embedded in the images.",
      status: passLayers.some((layer) => layer.analysis?.anomaly) ? "provisional" : "generated",
    });
    addedPassIds.push(pass.id);
    for (const layer of passLayers) layer.passId = pass.id;
    passes.push(pass);
  }
  assertWorld();
  return { session, layers, passes };
  } catch (error) {
    assets.layers = assets.layers.filter((item) => !addedLayerIds.includes(item.id));
    assets.analysisSessions = assets.analysisSessions.filter((item) => !addedSessionIds.includes(item.id));
    assets.refinementPasses = assets.refinementPasses.filter((item) => !addedPassIds.includes(item.id));
    throw error;
  }
}
