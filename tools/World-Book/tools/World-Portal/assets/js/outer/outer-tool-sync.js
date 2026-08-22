const DEFAULT_SYNC_ENDPOINT = "/__outer/orogen/sync";
const STALE_SERVER = "The running server predates world-keyed sync. Stop it and start server.py again.";

function staleServer(status) {
  return status === 404 || status === 501 ? STALE_SERVER : null;
}

function token() {
  return globalThis.crypto?.randomUUID?.()
    || `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeWorldIdentity(source = {}) {
  const worldKey = String(source.worldKey ?? source.id ?? "").trim();
  if (!worldKey) throw new Error("World sync requires an active world key.");
  return {
    worldKey,
    worldName: String(source.worldName ?? source.name ?? worldKey).trim() || worldKey,
  };
}

export function syncStateMatchesHandoff(state, expected = {}) {
  const worldKey = String(expected.worldKey || "");
  const handoffId = String(expected.handoffId || "");
  const sourceCommit = String(expected.sourceCommit || "").toLowerCase();
  return Boolean(worldKey && handoffId && /^[0-9a-f]{40}$/.test(sourceCommit))
    && state?.syncing === true
    && String(state.worldKey || "") === worldKey
    && state.handoffId === handoffId
    && state.toolId === (expected.toolId || "orogen")
    && String(state.sourceCommit || "").toLowerCase() === sourceCommit
    && Number.isFinite(Number(state.revision)) && Number(state.revision) > 0
    && typeof state.syncToken === "string" && state.syncToken.length > 0;
}

export function createOuterToolSync({
  onStateChange,
  fetchImpl = (...args) => fetch(...args),
  createToken = token,
  now = () => Date.now(),
} = {}) {
  let endpoint = DEFAULT_SYNC_ENDPOINT;
  let syncing = false;
  let supported = true;
  let reason = "World sync ready.";
  let worldKey = null;
  let worldName = null;
  let revision = null;
  let syncToken = null;
  let handoffId = null;
  let toolId = "orogen";
  let sourceCommit = null;
  let liveSourceCommit = null;
  let lastSyncedAt = null;
  let worldGeneration = 0;
  let operationGeneration = 0;
  let lastIssuedRevision = 0;

  function snapshot() {
    return {
      syncing, supported, reason, lastSyncedAt, lastWorldName: worldName,
      worldKey, worldName, revision, syncToken, handoffId, toolId,
      sourceCommit, liveSourceCommit, endpoint,
    };
  }

  function publish() {
    const state = snapshot();
    onStateChange?.(state);
    return state;
  }

  function resetWorld(identity, message = "Checking world sync…") {
    syncing = false;
    worldKey = identity.worldKey;
    worldName = identity.worldName;
    revision = null;
    syncToken = null;
    handoffId = null;
    lastSyncedAt = null;
    reason = message;
  }

  function adoptTool(tool) {
    if (!tool) return publish();
    if (typeof tool.syncSupported === "boolean") supported = tool.syncSupported;
    if (tool.syncReason) reason = tool.syncReason;
    if (tool.syncEndpoint) endpoint = tool.syncEndpoint;
    toolId = String(tool.id || "orogen");
    sourceCommit = typeof tool.commit === "string" && /^[0-9a-f]{40}$/i.test(tool.commit)
      ? tool.commit.toLowerCase() : null;
    liveSourceCommit = sourceCommit;
    if (!sourceCommit && supported) {
      supported = false;
      reason = "World sync requires the full pinned Orogen commit for provenance.";
    }
    // Runtime's syncing flag covers all worlds, never the browser's active one.
    return publish();
  }

  function adoptWorldPayload(payload, expectedKey) {
    if (String(payload?.worldKey || "") !== expectedKey) return false;
    const reportsLiveCheckout = Object.hasOwn(payload || {}, "liveSourceCommit");
    liveSourceCommit = /^[0-9a-f]{40}$/i.test(payload?.liveSourceCommit || "")
      ? payload.liveSourceCommit.toLowerCase() : (reportsLiveCheckout ? null : liveSourceCommit);
    if (reportsLiveCheckout && liveSourceCommit !== sourceCommit) {
      syncing = false;
      supported = false;
      revision = null;
      syncToken = null;
      handoffId = null;
      reason = "The checked-out Orogen revision changed; reload World Portal before syncing.";
      return true;
    }
    if (payload.syncing === true
      && (payload.toolId !== toolId || payload.sourceCommit !== sourceCommit)) return false;
    if (typeof payload.supported === "boolean") supported = payload.supported;
    syncing = payload.syncing === true && supported;
    if (payload.reason) reason = payload.reason;
    revision = syncing ? Number(payload.revision) || null : null;
    syncToken = syncing ? String(payload.syncToken || "") || null : null;
    handoffId = syncing ? String(payload.handoffId || "") || null : null;
    lastSyncedAt = syncing ? payload.updatedAt || null : null;
    if (syncing) reason = `${worldName} is synced to Orogen at revision ${revision}.`;
    else if (supported) reason = `${worldName} is not synced to Orogen.`;
    return true;
  }

  async function selectWorld(source) {
    const identity = normalizeWorldIdentity(source);
    worldGeneration += 1;
    const operation = ++operationGeneration;
    const generation = worldGeneration;
    resetWorld(identity);
    publish();
    if (!supported) return publish();
    try {
      const response = await fetchImpl(`${endpoint}?worldKey=${encodeURIComponent(worldKey)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (generation !== worldGeneration || operation !== operationGeneration
        || identity.worldKey !== worldKey) return snapshot();
      if (!response.ok) {
        reason = staleServer(response.status) || payload.error || `Could not read world sync (${response.status}).`;
        return publish();
      }
      if (!adoptWorldPayload(payload, identity.worldKey)) {
        syncing = false;
        reason = "Persisted sync provenance did not match this world and pinned Orogen checkout.";
      }
      return publish();
    } catch (error) {
      if (generation !== worldGeneration || operation !== operationGeneration) return snapshot();
      reason = `Could not read world sync: ${error?.message || error}`;
      return publish();
    }
  }

  async function enable(blob, options = {}) {
    if (!supported) return publish();
    if (!(blob instanceof Blob)) {
      reason = "No finalized heightmap is available for this world.";
      return publish();
    }
    const identity = normalizeWorldIdentity({
      worldKey: options.worldKey ?? worldKey,
      worldName: options.worldName ?? worldName,
    });
    if (identity.worldKey !== worldKey) {
      reason = "The heightmap belongs to a different world; sync was refused.";
      return publish();
    }
    if (toolId !== "orogen" || !sourceCommit) {
      reason = "World sync requires Orogen's registered tool ID and full pinned commit.";
      return publish();
    }
    const generation = worldGeneration;
    const operation = ++operationGeneration;
    const nextRevision = Math.max(Number(now()) || 0, lastIssuedRevision + 1, Number(revision || 0) + 1);
    lastIssuedRevision = nextRevision;
    const nextToken = createToken();
    const nextHandoff = String(options.handoffId || createToken());
    reason = `Syncing ${worldName} to Orogen…`;
    publish();
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          "X-World-Portal-World-Key": encodeURIComponent(worldKey),
          "X-World-Portal-World-Name": encodeURIComponent(worldName),
          "X-World-Portal-Revision": String(nextRevision),
          "X-World-Portal-Sync-Token": nextToken,
          "X-World-Portal-Handoff-Id": nextHandoff,
          "X-World-Portal-Tool-Id": toolId,
          "X-World-Portal-Source-Commit": sourceCommit,
        },
        body: blob,
      });
      const payload = await response.json().catch(() => ({}));
      if (generation !== worldGeneration || operation !== operationGeneration) return snapshot();
      if (!response.ok) {
        adoptWorldPayload(payload, worldKey);
        reason = staleServer(response.status) || payload.error || `World sync failed (${response.status}).`;
        return publish();
      }
      if (Number(payload.revision) !== nextRevision
        || payload.syncToken !== nextToken
        || payload.handoffId !== nextHandoff
        || payload.toolId !== toolId
        || payload.sourceCommit !== sourceCommit) {
        syncing = false;
        reason = "The sync response did not match this exact handoff operation.";
        return publish();
      }
      if (!adoptWorldPayload(payload, worldKey)) {
        reason = "The sync server returned a different world identity; the response was ignored.";
        syncing = false;
        return publish();
      }
      reason = `${worldName} now loads in Orogen.`;
      return publish();
    } catch (error) {
      if (generation !== worldGeneration || operation !== operationGeneration) return snapshot();
      reason = /fetch/i.test(String(error?.message || error))
        ? STALE_SERVER
        : `World sync failed: ${error?.message || error}`;
      return publish();
    }
  }

  async function disable() {
    if (!worldKey) return publish();
    const selectedKey = worldKey;
    const selectedName = worldName;
    const generation = worldGeneration;
    const operation = ++operationGeneration;
    try {
      const response = await fetchImpl(`${endpoint}?worldKey=${encodeURIComponent(selectedKey)}`, {
        method: "DELETE",
        headers: syncToken ? { "X-World-Portal-If-Token": syncToken } : {},
      });
      const payload = await response.json().catch(() => ({}));
      if (generation !== worldGeneration || operation !== operationGeneration) return snapshot();
      if (!response.ok) {
        adoptWorldPayload(payload, selectedKey);
        reason = staleServer(response.status) || payload.error || `Could not turn world sync off (${response.status}).`;
        return publish();
      }
      resetWorld({ worldKey: selectedKey, worldName: selectedName }, `${selectedName} now opens on Orogen's own default.`);
      return publish();
    } catch (error) {
      if (generation !== worldGeneration || operation !== operationGeneration) return snapshot();
      reason = `Could not turn world sync off: ${error?.message || error}`;
      return publish();
    }
  }

  function frameContext() {
    return supported && syncing && worldKey && revision && syncToken
      ? { worldKey, worldName, revision, syncToken, handoffId, toolId, sourceCommit }
      : null;
  }

  return {
    getState: snapshot,
    getFrameContext: frameContext,
    adoptTool,
    selectWorld,
    enable,
    disable,
    isSyncing: () => syncing,
    isSupported: () => supported,
  };
}
