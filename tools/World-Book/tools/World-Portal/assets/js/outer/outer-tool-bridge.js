export const OROGEN_BRIDGE_PROTOCOL = "world-portal.orogen-bridge";
export const OROGEN_BRIDGE_VERSION = 1;
export const OROGEN_BRIDGE_CAPABILITIES = Object.freeze([
  "world-context@1",
  "world-metrics@1",
  "planet-mirror@1",
]);

const INBOUND_TYPES = new Set(["orogen.capabilities", "orogen.world-metrics"]);

function id(prefix) {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function validateOrogenWorldMetrics(metrics, { sourceCommit } = {}) {
  if (!object(metrics)
    || !Number.isInteger(metrics.landmassCount) || metrics.landmassCount < 0
    || !Array.isArray(metrics.landmasses) || metrics.landmasses.length > 4096
    || metrics.landmasses.length !== metrics.landmassCount
    || !finiteNonnegative(metrics.planetRadiusKm) || metrics.planetRadiusKm === 0
    || metrics.units?.distance !== "km" || metrics.units?.area !== "km2"
    || metrics.source?.tool !== "orogen"
    || metrics.source?.commit !== sourceCommit
    || typeof metrics.source?.method !== "string" || !metrics.source.method || metrics.source.method.length > 120) {
    return false;
  }
  return metrics.landmasses.every((landmass) => object(landmass)
    && typeof landmass.id === "string" && landmass.id.length > 0 && landmass.id.length <= 128
    && finiteNonnegative(landmass.areaKm2)
    && finiteNonnegative(landmass.northSouthKm)
    && (landmass.eastWestKm === null || finiteNonnegative(landmass.eastWestKm))
    && (landmass.perimeterKm === undefined || finiteNonnegative(landmass.perimeterKm)));
}

export function validateOrogenBridgeEnvelope(value, { bridgeSessionId, worldContext = null } = {}) {
  if (!object(value)) return { valid: false, reason: "not-an-object" };
  if (value.protocol !== OROGEN_BRIDGE_PROTOCOL) return { valid: false, reason: "wrong-protocol" };
  if (value.version !== OROGEN_BRIDGE_VERSION) return { valid: false, reason: "wrong-version" };
  if (!INBOUND_TYPES.has(value.type)) return { valid: false, reason: "unknown-type" };
  if (value.bridgeSessionId !== bridgeSessionId) return { valid: false, reason: "wrong-session" };
  if (typeof value.messageId !== "string" || !value.messageId) return { valid: false, reason: "missing-message-id" };
  if (typeof value.sentAt !== "string" || !Number.isFinite(Date.parse(value.sentAt))) {
    return { valid: false, reason: "invalid-sent-at" };
  }
  if (!object(value.payload)) return { valid: false, reason: "invalid-payload" };
  if (!object(value.world) || !worldContext
    || value.world.key !== worldContext.worldKey
    || value.world.name !== (worldContext.worldName || worldContext.worldKey)
    || Number(value.world.revision) !== Number(worldContext.revision)
    || value.world.handoffId !== worldContext.handoffId
    || value.world.toolId !== worldContext.toolId
    || value.world.sourceCommit !== worldContext.sourceCommit) {
    return { valid: false, reason: "wrong-world" };
  }
  if (value.type === "orogen.capabilities") {
    if (!Array.isArray(value.payload.capabilities)
      || value.payload.capabilities.length > 64
      || value.payload.capabilities.some((item) => typeof item !== "string" || item.length > 120)) {
      return { valid: false, reason: "invalid-capabilities" };
    }
  }
  if (value.type === "orogen.world-metrics") {
    if (!object(value.payload.metrics)) return { valid: false, reason: "invalid-metrics" };
    if (!validateOrogenWorldMetrics(value.payload.metrics, worldContext)) {
      return { valid: false, reason: "invalid-metrics-schema" };
    }
  }
  return { valid: true, reason: null };
}

export function createOuterToolBridge({ onStateChange, onMetrics, handshakeTimeout = 1800 } = {}) {
  let targetWindow = null;
  let targetOrigin = null;
  let worldContext = null;
  let bridgeSessionId = null;
  let capabilities = [];
  let state = "detached";
  let reason = "Bridge not attached.";
  let timeoutId = null;

  function snapshot() {
    return {
      protocol: OROGEN_BRIDGE_PROTOCOL,
      version: OROGEN_BRIDGE_VERSION,
      bridgeSessionId,
      capabilities: [...capabilities],
      state,
      reason,
      worldKey: worldContext?.worldKey || null,
    };
  }

  function publish() {
    const result = snapshot();
    onStateChange?.(result);
    return result;
  }

  function worldEnvelope() {
    if (!worldContext) return null;
    return {
      key: worldContext.worldKey,
      name: worldContext.worldName || worldContext.worldKey,
      revision: Number(worldContext.revision) || null,
      handoffId: worldContext.handoffId || null,
      toolId: worldContext.toolId || "orogen",
      sourceCommit: worldContext.sourceCommit || null,
    };
  }

  function post(type, payload) {
    if (!targetWindow || !targetOrigin || !bridgeSessionId) return false;
    try {
      targetWindow.postMessage({
        protocol: OROGEN_BRIDGE_PROTOCOL,
        version: OROGEN_BRIDGE_VERSION,
        type,
        bridgeSessionId,
        messageId: id("message"),
        sentAt: new Date().toISOString(),
        world: worldEnvelope(),
        payload,
      }, targetOrigin);
      return true;
    } catch (error) {
      state = "unavailable";
      reason = `Bridge message was blocked safely: ${error?.message || error}`;
      publish();
      return false;
    }
  }

  function handleMessage(event) {
    if (event.source !== targetWindow || event.origin !== targetOrigin) return;
    const validation = validateOrogenBridgeEnvelope(event.data, { bridgeSessionId, worldContext });
    if (!validation.valid) return;
    if (event.data.type === "orogen.capabilities") {
      capabilities = [...new Set(event.data.payload.capabilities)]
        .filter((item) => OROGEN_BRIDGE_CAPABILITIES.includes(item));
      state = "connected";
      reason = capabilities.length
        ? `Orogen bridge connected: ${capabilities.join(", ")}.`
        : "Orogen bridge connected without shared capabilities.";
      clearTimeout(timeoutId);
      publish();
      if (capabilities.includes("world-context@1") && worldContext) {
        post("host.world-context", { readOnly: true });
      }
    } else if (event.data.type === "orogen.world-metrics"
      && capabilities.includes("world-metrics@1")) {
      onMetrics?.({
        metrics: event.data.payload.metrics,
        world: { ...event.data.world },
        protocol: OROGEN_BRIDGE_PROTOCOL,
        version: OROGEN_BRIDGE_VERSION,
      });
    }
  }

  function attach({ sourceWindow, sourceUrl, context = null }) {
    clearTimeout(timeoutId);
    let parsed;
    try {
      parsed = new URL(sourceUrl, window.location.href);
    } catch {
      parsed = null;
    }
    if (!sourceWindow || !parsed || !/^https?:$/.test(parsed.protocol)
      || parsed.origin !== window.location.origin
      || !parsed.pathname.startsWith("/outer/orogen/")) {
      targetWindow = null;
      targetOrigin = null;
      state = "ignored-source";
      reason = "Bridge ignored a non-Orogen or non-HTTP iframe load.";
      return publish();
    }
    targetWindow = sourceWindow;
    targetOrigin = parsed.origin;
    worldContext = context ? { ...context } : null;
    bridgeSessionId = id("bridge");
    capabilities = [];
    state = "handshaking";
    reason = "Offering the versioned bridge contract to Orogen…";
    publish();
    post("host.hello", { requestedCapabilities: [...OROGEN_BRIDGE_CAPABILITIES], readOnlyMirror: true });
    timeoutId = window.setTimeout(() => {
      if (state !== "handshaking") return;
      state = "legacy-fallback";
      reason = "This pinned Orogen revision has no message bridge; audited canvas mirroring remains available.";
      publish();
    }, handshakeTimeout);
    return snapshot();
  }

  function updateWorld(context) {
    if (!context) return snapshot();
    worldContext = context ? { ...context } : null;
    if (state === "connected" && capabilities.includes("world-context@1")) {
      post("host.world-context", { readOnly: true });
    }
    return publish();
  }

  function detach() {
    clearTimeout(timeoutId);
    targetWindow = null;
    targetOrigin = null;
    worldContext = null;
    bridgeSessionId = null;
    capabilities = [];
    state = "detached";
    reason = "Bridge not attached.";
    return publish();
  }

  window.addEventListener("message", handleMessage);
  return {
    attach, updateWorld, detach, getState: snapshot,
    destroy() {
      detach();
      window.removeEventListener("message", handleMessage);
    },
  };
}
