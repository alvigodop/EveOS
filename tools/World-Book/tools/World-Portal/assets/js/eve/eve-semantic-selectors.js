import {
  ensureLayerAssets, getCanonicalLayer, layerDomain,
} from "../world/world-layer-store.js";
import { activeMissionPass, getActiveRefinementMission } from "../mission/refinement-mission-store.js";
import { evidenceProfile } from "../refinement/evidence-profile.js";

const SEMANTIC_LAYER_ROLES = Object.freeze([
  "current-canonical-visual",
  "current-canonical-mask",
  "current-canonical-heightmap",
  "latest-generated-mask",
  "latest-generated-heightmap",
  "latest-orogen-land-mask",
  "latest-orogen-land-heightmap",
  "highest-coastline-trust-mask",
  "highest-elevation-trust-heightmap",
  "highest-visual-trust-satellite",
  "anomalous-useful-elevation",
  "active-mission-pass-layers",
]);

function createdValue(layer) {
  return Date.parse(layer.updatedAt || layer.createdAt || 0) || 0;
}

function trustFor(layer, field) {
  return Number(evidenceProfile(layer).trust?.[field] || 0);
}

function typeMatches(layer, selector) {
  if (selector.type && layer.type !== selector.type) return false;
  if (selector.domain && layerDomain(layer.type) !== selector.domain) return false;
  if (selector.role) {
    const role = selector.role;
    if (["visual", "mask", "heightmap", "analysis"].includes(role) && layerDomain(layer.type) !== role) return false;
    if (role === "satellite" && layer.type !== "satellite") return false;
    if (role === "climate" && !["climate", "biome", "classified-regions"].includes(layer.type)) return false;
  }
  return true;
}

function statusMatches(layer, selector) {
  if (!selector.status) return true;
  const requested = Array.isArray(selector.status) ? selector.status : [selector.status];
  const profileStatus = evidenceProfile(layer).status;
  return requested.includes(layer.status) || requested.includes(profileStatus);
}

function missionLayerIds(record, mission) {
  if (!mission) return new Set();
  const pass = activeMissionPass(mission);
  const sessions = new Set(mission.importedSessionIds || []);
  return new Set(ensureLayerAssets(record).layers.filter((layer) => (
    layer.metadata?.missionId === mission.id
    || layer.metadata?.missionPassId === pass?.id
    || layer.passId === pass?.id
    || sessions.has(layer.sessionId)
  )).map((layer) => layer.id));
}

function semanticCandidates(record, selector, mission) {
  const assets = ensureLayerAssets(record);
  const semantic = selector.semantic || selector.role;
  const direct = {
    "current-canonical-visual": getCanonicalLayer(record, "visual"),
    "current-canonical-mask": getCanonicalLayer(record, "mask"),
    "current-canonical-heightmap": getCanonicalLayer(record, "heightmap"),
  }[semantic];
  if (direct) return [direct];
  if (semantic === "latest-orogen-session") {
    return [...assets.analysisSessions].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  }
  if (semantic === "active-mission") return mission ? [mission] : [];
  let layers = assets.layers.filter((layer) => typeMatches(layer, selector) && statusMatches(layer, selector));
  if (selector.sessionId) layers = layers.filter((layer) => layer.sessionId === selector.sessionId);
  if (selector.missionId) layers = layers.filter((layer) => layer.metadata?.missionId === selector.missionId);
  if (selector.missionPassId) layers = layers.filter((layer) => layer.metadata?.missionPassId === selector.missionPassId || layer.passId === selector.missionPassId);
  if (semantic === "latest-generated-mask") layers = layers.filter((layer) => layerDomain(layer.type) === "mask" && (layer.metadata?.generatedOutput || layer.status === "generated"));
  if (semantic === "latest-generated-heightmap") layers = layers.filter((layer) => layerDomain(layer.type) === "heightmap" && (layer.metadata?.generatedOutput || layer.status === "generated"));
  if (semantic === "latest-orogen-land-mask") layers = layers.filter((layer) => layer.type === "orogen-land-mask");
  if (semantic === "latest-orogen-land-heightmap") layers = layers.filter((layer) => layer.type === "orogen-land-heightmap");
  if (semantic === "highest-coastline-trust-mask") layers = layers.filter((layer) => layerDomain(layer.type) === "mask");
  if (semantic === "highest-elevation-trust-heightmap" || semantic === "anomalous-useful-elevation") layers = layers.filter((layer) => layerDomain(layer.type) === "heightmap");
  if (semantic === "highest-visual-trust-satellite") layers = layers.filter((layer) => layerDomain(layer.type) === "visual");
  if (semantic === "anomalous-useful-elevation") layers = layers.filter((layer) => evidenceProfile(layer).status === "anomalous-useful");
  if (semantic === "active-mission-pass-layers") {
    const ids = missionLayerIds(record, mission);
    layers = layers.filter((layer) => ids.has(layer.id));
  }
  return layers;
}

function orderCandidates(items, selector) {
  const field = selector.trustField;
  const order = selector.order || (field ? "highest-trust" : "latest");
  return [...items].sort((a, b) => {
    if (order === "highest-trust") return trustFor(b, field || "height") - trustFor(a, field || "height") || createdValue(b) - createdValue(a);
    if (order === "lowest-trust") return trustFor(a, field || "height") - trustFor(b, field || "height") || createdValue(b) - createdValue(a);
    if (order === "oldest") return createdValue(a) - createdValue(b);
    if (order === "largest") return Number(b.analysis?.landPixels || b.byteSize || 0) - Number(a.analysis?.landPixels || a.byteSize || 0);
    return createdValue(b) - createdValue(a);
  });
}

export function resolveSemanticSelector(record, selector, options = {}) {
  if (!selector || typeof selector !== "object") throw new Error("Semantic selector must be an object.");
  const mission = options.mission || getActiveRefinementMission(record);
  const items = orderCandidates(semanticCandidates(record, selector, mission), selector);
  const limit = Math.max(1, Math.min(50, Number(selector.limit || 1)));
  if (!items.length) throw new Error(`Semantic selector found no match: ${selector.semantic || selector.role || "custom selector"}.`);
  if (limit === 1 && items.length > 1 && selector.order === "none") {
    throw new Error(`Semantic selector is ambiguous and matched ${items.length} records.`);
  }
  const selected = items.slice(0, limit);
  const ids = selected.map((item) => item.id);
  return {
    value: limit === 1 ? ids[0] : ids,
    ids,
    labels: selected.map((item) => item.name || item.id),
    selector: JSON.parse(JSON.stringify(selector)),
  };
}

function isSelectorObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && value.selector && typeof value.selector === "object";
}

export function resolveSemanticSelectors(value, context, trace = [], parentKey = "") {
  if (isSelectorObject(value)) {
    const resolved = resolveSemanticSelector(context.record, value.selector, context);
    trace.push(resolved);
    const wantsArray = /ids$/i.test(parentKey) || value.selector.return === "array";
    return wantsArray ? resolved.ids : resolved.value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveSemanticSelectors(item, context, trace, parentKey));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSemanticSelectors(item, context, trace, key)]));
  }
  return value;
}

export function resolvePlanSelectors(plan, context) {
  const trace = [];
  const resolvedPlan = resolveSemanticSelectors(JSON.parse(JSON.stringify(plan)), context, trace);
  return { resolvedPlan, resolutions: trace };
}

export function semanticSelectorManifest() {
  return {
    protocol: "world-portal-semantic-selectors",
    version: 1,
    roles: SEMANTIC_LAYER_ROLES,
    sessionRoles: ["latest-orogen-session", "active-mission"],
    fields: {
      semantic: "Named stable role",
      role: "visual, mask, heightmap, satellite, climate, or a named semantic role",
      type: "Exact World Portal layer type",
      domain: "visual, mask, heightmap, or analysis",
      status: "Layer or evidence status",
      trustField: "coastline, height, visual, or climate",
      order: "latest, oldest, highest-trust, lowest-trust, largest, or none",
      limit: "Maximum returned IDs",
      sessionId: "Optional analysis-session restriction",
      missionId: "Optional mission restriction",
      missionPassId: "Optional mission-pass restriction",
    },
    rule: "Selectors resolve during plan validation. Ambiguous single-result selectors stop for review rather than guessing.",
  };
}
