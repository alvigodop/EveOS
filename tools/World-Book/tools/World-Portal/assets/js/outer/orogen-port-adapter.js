import { getCanonicalLayer, ensureLayerAssets, layerDomain } from "../world/world-layer-store.js";

// Orogen's import page states its contract plainly: equirectangular, exact 2:1,
// black is ocean, brighter is higher. Heightmap Forge finalization already
// guarantees that, so the adapter selects and finalizes rather than converting.
export const OROGEN_INPUT_CONTRACT = Object.freeze({
  projection: "equirectangular",
  aspectRatio: "2:1",
  oceanValue: 0,
  oceanMeaning: "black is ocean",
  landMeaning: "brighter is higher elevation",
  accepts: ["image/png", "image/jpeg", "image/webp"],
});

export const OROGEN_HANDOFF_FORMAT = "world-portal-outer-tool-handoff";
export const OROGEN_HANDOFF_VERSION = 2;

function createId() {
  return globalThis.crypto?.randomUUID?.()
    || `handoff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Filename tokens Orogen uses on export, mapped to World Portal layer roles.
// Intake stays conservative: an unmatched file is imported without a guessed role.
const RETURN_ROLES = [
  { token: /land[_-]?mask|landmask/i, type: "land-mask", role: "mask evidence" },
  { token: /land[_-]?height/i, type: "heightmap", role: "height evidence" },
  { token: /height(map)?/i, type: "heightmap", role: "height evidence" },
  { token: /satellite|biome/i, type: "visual-map", role: "visual evidence" },
  { token: /climate|koppen|köppen/i, type: "climate-map", role: "climate evidence" },
  { token: /terrain|colou?r/i, type: "visual-map", role: "visual evidence" },
];

export function inferReturnRole(filename) {
  const name = String(filename || "");
  const match = RETURN_ROLES.find((entry) => entry.token.test(name));
  return match ? { type: match.type, role: match.role, matched: true } : { type: null, role: "unclassified", matched: false };
}

export function describeReturnFiles(files) {
  return [...files].map((file) => {
    const inferred = inferReturnRole(file.name);
    return { name: file.name, size: file.size, ...inferred };
  });
}

// Newest layer in a domain, used when a world has forged output but has not
// promoted anything yet. Freshly forged output is the normal thing to send.
function latestInDomain(record, domain) {
  const layers = ensureLayerAssets(record).layers.filter((layer) => layerDomain(layer.type) === domain);
  return layers.reduce((newest, layer) => (
    !newest || String(layer.updatedAt || layer.createdAt || "") > String(newest.updatedAt || newest.createdAt || "")
      ? layer : newest
  ), null);
}

// Selection order: explicit override, then the world's canonical layer, then the
// most recent layer in that domain. The last step matters because Heightmap
// Forge output is generated, not canonical, and sending it out is the normal
// first pass rather than an exception.
export function resolveSendPair(record, overrides = {}) {
  const assets = ensureLayerAssets(record);
  const byId = (id) => assets.layers.find((layer) => layer.id === id) || null;
  const mask = (overrides.maskLayerId ? byId(overrides.maskLayerId) : null)
    || getCanonicalLayer(record, "mask")
    || latestInDomain(record, "mask");
  const heightmap = (overrides.heightmapLayerId ? byId(overrides.heightmapLayerId) : null)
    || getCanonicalLayer(record, "heightmap")
    || latestInDomain(record, "heightmap");
  const problems = [];
  if (!mask) problems.push("No land mask available. Run Heightmap Forge to generate one.");
  else if (layerDomain(mask.type) !== "mask") problems.push(`${mask.name} is not a mask layer.`);
  if (!heightmap) problems.push("No heightmap available. Run Heightmap Forge to generate one.");
  else if (layerDomain(heightmap.type) !== "heightmap") problems.push(`${heightmap.name} is not a heightmap layer.`);
  return {
    mask,
    heightmap,
    ready: problems.length === 0,
    problems,
    usedOverride: Boolean(overrides.maskLayerId || overrides.heightmapLayerId),
    usingCanonical: Boolean(mask?.isCanonical && heightmap?.isCanonical),
  };
}

export function selectableLayers(record, domain) {
  return ensureLayerAssets(record).layers
    .filter((layer) => layerDomain(layer.type) === domain)
    .map((layer) => ({ id: layer.id, name: layer.name, isCanonical: Boolean(layer.isCanonical) }));
}

// The handoff record is provenance, not a transport. It states exactly which
// layers left World Portal and which pinned tool commit they were sent to, so a
// returned layer can be traced without trusting filenames alone.
export function buildHandoffManifest({
  record, tool, pair, finalization = null, handoffId = createId(), syncContext = null,
}) {
  if (!record?.id) throw new Error("An Orogen handoff requires a world identity.");
  if (tool?.id !== "orogen" || !/^[0-9a-f]{40}$/i.test(tool?.commit || "")) {
    throw new Error("An Orogen handoff requires the registered tool and full pinned commit.");
  }
  const sourceCommit = tool.commit.toLowerCase();
  return {
    format: OROGEN_HANDOFF_FORMAT,
    version: OROGEN_HANDOFF_VERSION,
    handoffId,
    sentAt: new Date().toISOString(),
    ownership: { worldKey: record.id, toolId: tool.id, sourceCommit },
    world: { id: record.id, key: record.id, name: record.name },
    tool: {
      id: tool.id,
      name: tool.name,
      repository: tool.repository,
      license: tool.license,
      commit: sourceCommit,
      entry: tool.entry,
    },
    bridge: {
      protocol: "world-portal.orogen-bridge",
      version: 1,
      worldRevision: Number(syncContext?.revision) || null,
    },
    contract: OROGEN_INPUT_CONTRACT,
    sent: {
      mode: finalization?.sourceMode || "finalized-layer-pair",
      maskLayerId: pair.mask?.id || null,
      maskLayerName: pair.mask?.name || null,
      heightmapLayerId: pair.heightmap?.id || null,
      heightmapLayerName: pair.heightmap?.name || null,
      usedOverride: pair.usedOverride,
      payload: finalization?.payloadProvenance || null,
    },
    finalization: finalization
      ? {
        finalMaskLayerId: finalization.finalMaskLayerId || null,
        finalHeightmapLayerId: finalization.finalHeightmapLayerId || null,
        width: finalization.width || finalization.output?.width || null,
        height: finalization.height || finalization.output?.height || null,
      }
      : null,
    boundary: "Versioned messages carry identity and data contracts. The audited fallback captures Orogen's render canvas and relays camera gestures only.",
  };
}

export function buildReturnProvenance({ handoff, worldId, tool }) {
  if (!handoff?.handoffId || handoff?.world?.id !== worldId) {
    throw new Error("Returned Orogen files do not match the active world handoff.");
  }
  const sourceCommit = String(tool?.commit || "").toLowerCase();
  if (tool?.id !== "orogen" || !/^[0-9a-f]{40}$/.test(sourceCommit)
    || handoff?.ownership?.toolId !== tool.id
    || handoff?.ownership?.sourceCommit !== sourceCommit) {
    throw new Error("Returned Orogen provenance does not match the pinned checkout.");
  }
  return {
    format: OROGEN_HANDOFF_FORMAT,
    version: OROGEN_HANDOFF_VERSION,
    handoffId: handoff.handoffId,
    worldId,
    worldName: handoff.world.name,
    toolId: tool.id,
    sourceCommit,
    sourceRepository: tool.repository,
    bridgeProtocol: handoff.bridge.protocol,
    bridgeProtocolVersion: handoff.bridge.version,
    worldRevision: handoff.bridge.worldRevision,
    inputMode: handoff.sent?.mode || null,
    inputPayload: handoff.sent?.payload || null,
    inputLayerIds: [
      handoff.finalization?.finalMaskLayerId,
      handoff.finalization?.finalHeightmapLayerId,
    ].filter(Boolean),
  };
}
