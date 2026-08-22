import test from "node:test";
import assert from "node:assert/strict";

import {
  OROGEN_BRIDGE_PROTOCOL, OROGEN_BRIDGE_VERSION,
  validateOrogenBridgeEnvelope, validateOrogenWorldMetrics,
} from "../assets/js/outer/outer-tool-bridge.js";
import {
  buildOuterToolFrameUrl, matchOuterToolFrameContext,
} from "../assets/js/outer/outer-tool-frame.js";
import {
  createOuterToolSync, syncStateMatchesHandoff,
} from "../assets/js/outer/outer-tool-sync.js";
import { normalizeOuterTool } from "../assets/js/outer/outer-tool-registry.js";
import {
  buildHandoffManifest, buildReturnProvenance,
} from "../assets/js/outer/orogen-port-adapter.js";
import { validateOrogenRevisionCheck } from "../assets/js/outer/orogen-update-checker.js";
import { selectOrogenRenderCanvas } from "../assets/js/outer/orogen-planet-mirror.js";
import { revalidateOuterToolContext } from "../assets/js/outer/outer-tool-sync-lifecycle.js";

const COMMIT = "cc2662b4edd52231c4f65d8765f3ef12cd82d9b7";
const CONTEXT = {
  worldKey: "world-a", worldName: "World A", revision: 41,
  syncToken: "sync-token-a", handoffId: "handoff-a",
  toolId: "orogen", sourceCommit: COMMIT,
};

function envelope(type, payload) {
  return {
    protocol: OROGEN_BRIDGE_PROTOCOL,
    version: OROGEN_BRIDGE_VERSION,
    type,
    bridgeSessionId: "bridge-a",
    messageId: "message-a",
    sentAt: "2026-08-20T12:00:00Z",
    world: {
      key: CONTEXT.worldKey,
      name: CONTEXT.worldName,
      revision: CONTEXT.revision,
      handoffId: CONTEXT.handoffId,
      toolId: CONTEXT.toolId,
      sourceCommit: CONTEXT.sourceCommit,
    },
    payload,
  };
}

function metrics() {
  return {
    landmassCount: 1,
    planetRadiusKm: 6371,
    units: { distance: "km", area: "km2" },
    source: { tool: "orogen", commit: COMMIT, method: "connected-components-v1" },
    landmasses: [{
      id: "landmass-1", areaKm2: 1234, northSouthKm: 80, eastWestKm: 120,
    }],
  };
}

test("frame URL carries the complete world/tool ownership tuple", () => {
  const url = new URL(buildOuterToolFrameUrl(
    "outer/orogen/import.html?wpWorldKey=stale", "http://127.0.0.1:8770/", CONTEXT,
  ));
  assert.equal(url.searchParams.get("wpWorldKey"), "world-a");
  assert.equal(url.searchParams.get("wpSyncRevision"), "41");
  assert.equal(url.searchParams.get("wpSyncToken"), "sync-token-a");
  assert.equal(url.searchParams.get("wpHandoffId"), "handoff-a");
  assert.equal(url.searchParams.get("wpToolId"), "orogen");
  assert.equal(url.searchParams.get("wpSourceCommit"), COMMIT);
});

test("only the exact synced import document is treated as attached world data", () => {
  const sourceUrl = buildOuterToolFrameUrl(
    "outer/orogen/import.html", "http://127.0.0.1:8770/", CONTEXT,
  );
  assert.equal(matchOuterToolFrameContext(
    { loaded: true, sourceUrl }, CONTEXT, "http://127.0.0.1:8770/",
  ), CONTEXT);
  const generator = sourceUrl.replace("/import.html", "/index.html");
  assert.equal(matchOuterToolFrameContext(
    { loaded: true, sourceUrl: generator }, CONTEXT, "http://127.0.0.1:8770/",
  ), null);
});

test("bridge rejects missing timestamp, wrong source commit, and malformed metrics", () => {
  const options = { bridgeSessionId: "bridge-a", worldContext: CONTEXT };
  const capabilities = envelope("orogen.capabilities", { capabilities: ["world-context@1"] });
  assert.equal(validateOrogenBridgeEnvelope(capabilities, options).valid, true);
  delete capabilities.sentAt;
  assert.equal(validateOrogenBridgeEnvelope(capabilities, options).reason, "invalid-sent-at");

  const wrongCommit = envelope("orogen.world-metrics", { metrics: metrics() });
  wrongCommit.world.sourceCommit = "0".repeat(40);
  assert.equal(validateOrogenBridgeEnvelope(wrongCommit, options).reason, "wrong-world");

  const malformed = envelope("orogen.world-metrics", { metrics: { ...metrics(), landmassCount: -1 } });
  assert.equal(validateOrogenBridgeEnvelope(malformed, options).reason, "invalid-metrics-schema");
  assert.equal(validateOrogenWorldMetrics(metrics(), CONTEXT), true);
});

test("registry preserves runtime sync and bridge fields", () => {
  const tool = normalizeOuterTool({
    id: "orogen", commit: COMMIT, syncSupported: true, syncReason: "ready",
    syncing: true, syncEndpoint: "/sync", updateEndpoint: "/update",
    bridgeProtocol: OROGEN_BRIDGE_PROTOCOL, bridgeProtocolVersion: 1,
  });
  assert.equal(tool.syncSupported, true);
  assert.equal(tool.syncReason, "ready");
  assert.equal(tool.syncing, true);
  assert.equal(tool.syncEndpoint, "/sync");
  assert.equal(tool.updateEndpoint, "/update");
  assert.equal(tool.bridgeProtocol, OROGEN_BRIDGE_PROTOCOL);
});

test("sync success belongs only to the exact handoff that won the operation", () => {
  const state = {
    syncing: true, worldKey: "world-a", revision: 7, syncToken: "sync-token-a",
    handoffId: "handoff-a", toolId: "orogen", sourceCommit: COMMIT,
  };
  const expected = {
    worldKey: "world-a", handoffId: "handoff-a", toolId: "orogen", sourceCommit: COMMIT,
  };
  assert.equal(syncStateMatchesHandoff(state, expected), true);
  assert.equal(syncStateMatchesHandoff(state, { ...expected, handoffId: "handoff-b" }), false);
  assert.equal(syncStateMatchesHandoff(state, { ...expected, worldKey: "world-b" }), false);
  assert.equal(syncStateMatchesHandoff(state, { ...expected, sourceCommit: "a".repeat(40) }), false);
});

test("a superseded H1 enable cannot accept the winning H2 snapshot", async () => {
  let tokenNumber = 0;
  let resolveH1;
  const pendingH1 = new Promise((resolve) => { resolveH1 = resolve; });
  const response = (payload) => ({ ok: true, status: 200, json: async () => payload });
  const payloadFrom = (headers) => ({
    syncing: true,
    supported: true,
    worldKey: "world-a",
    worldName: "World A",
    revision: Number(headers["X-World-Portal-Revision"]),
    syncToken: headers["X-World-Portal-Sync-Token"],
    handoffId: headers["X-World-Portal-Handoff-Id"],
    toolId: "orogen",
    sourceCommit: COMMIT,
    liveSourceCommit: COMMIT,
  });
  const sync = createOuterToolSync({
    now: () => 100,
    createToken: () => `sync-token-${tokenNumber += 1}`,
    fetchImpl: async (_url, options = {}) => {
      if (options.method !== "POST") return response({
        syncing: false, supported: true, worldKey: "world-a", liveSourceCommit: COMMIT,
      });
      const payload = payloadFrom(options.headers);
      return payload.handoffId === "handoff-h1" ? pendingH1 : response(payload);
    },
  });
  sync.adoptTool({ id: "orogen", commit: COMMIT, syncSupported: true, syncEndpoint: "/sync" });
  await sync.selectWorld({ id: "world-a", name: "World A" });
  const h1 = sync.enable(new Blob(["h1"]), {
    worldKey: "world-a", worldName: "World A", handoffId: "handoff-h1",
  });
  const h2 = await sync.enable(new Blob(["h2"]), {
    worldKey: "world-a", worldName: "World A", handoffId: "handoff-h2",
  });
  resolveH1(response({ ...payloadFrom({
    "X-World-Portal-Revision": "100",
    "X-World-Portal-Sync-Token": "sync-token-1",
    "X-World-Portal-Handoff-Id": "handoff-h1",
  }) }));
  const h1Result = await h1;
  const expectedH1 = { worldKey: "world-a", handoffId: "handoff-h1", toolId: "orogen", sourceCommit: COMMIT };
  const expectedH2 = { ...expectedH1, handoffId: "handoff-h2" };
  assert.equal(syncStateMatchesHandoff(h1Result, expectedH1), false);
  assert.equal(syncStateMatchesHandoff(h1Result, expectedH2), true);
  assert.equal(syncStateMatchesHandoff(h2, expectedH2), true);
});

test("sync ignores an old-world status response after selecting a new world", async () => {
  let resolveA;
  const pendingA = new Promise((resolve) => { resolveA = resolve; });
  const response = (payload) => ({ ok: true, status: 200, json: async () => payload });
  const sync = createOuterToolSync({
    fetchImpl: (url) => url.includes("world-a")
      ? pendingA
      : Promise.resolve(response({
        syncing: false, supported: true, worldKey: "world-b", liveSourceCommit: COMMIT,
      })),
  });
  sync.adoptTool({ id: "orogen", commit: COMMIT, syncSupported: true, syncEndpoint: "/sync" });
  const selectingA = sync.selectWorld({ id: "world-a", name: "World A" });
  await sync.selectWorld({ id: "world-b", name: "World B" });
  resolveA(response({
    syncing: true, supported: true, worldKey: "world-a", revision: 9,
    syncToken: "sync-token-a", handoffId: "handoff-a", toolId: "orogen", sourceCommit: COMMIT,
    liveSourceCommit: COMMIT,
  }));
  await selectingA;
  assert.equal(sync.getState().worldKey, "world-b");
  assert.equal(sync.isSyncing(), false);
});

test("a delayed same-world status GET cannot overwrite a newer enable", async () => {
  let resolveStatus;
  const pendingStatus = new Promise((resolve) => { resolveStatus = resolve; });
  const response = (payload) => ({ ok: true, status: 200, json: async () => payload });
  const sync = createOuterToolSync({
    now: () => 77,
    createToken: () => "sync-token-new",
    fetchImpl: async (_url, options = {}) => {
      if (options.method !== "POST") return pendingStatus;
      return response({
        syncing: true, supported: true, worldKey: "world-a", worldName: "World A",
        revision: 77, syncToken: "sync-token-new", handoffId: "handoff-new",
        toolId: "orogen", sourceCommit: COMMIT, liveSourceCommit: COMMIT,
      });
    },
  });
  sync.adoptTool({ id: "orogen", commit: COMMIT, syncSupported: true, syncEndpoint: "/sync" });
  const selecting = sync.selectWorld({ id: "world-a", name: "World A" });
  const enabled = await sync.enable(new Blob(["png"]), {
    worldKey: "world-a", worldName: "World A", handoffId: "handoff-new",
  });
  assert.equal(enabled.syncing, true);
  resolveStatus(response({
    syncing: false, supported: true, worldKey: "world-a", liveSourceCommit: COMMIT,
  }));
  await selecting;
  assert.equal(sync.getState().syncing, true);
  assert.equal(sync.getState().revision, 77);
  assert.equal(sync.getFrameContext().handoffId, "handoff-new");
});

test("a delayed same-world status GET cannot resurrect sync after a newer disable", async () => {
  let statusCalls = 0;
  let resolveDelayed;
  const delayed = new Promise((resolve) => { resolveDelayed = resolve; });
  const response = (payload) => ({ ok: true, status: 200, json: async () => payload });
  const synced = {
    syncing: true, supported: true, worldKey: "world-a", worldName: "World A",
    revision: 55, syncToken: "sync-token-old", handoffId: "handoff-old",
    toolId: "orogen", sourceCommit: COMMIT, liveSourceCommit: COMMIT,
  };
  const sync = createOuterToolSync({
    fetchImpl: async (_url, options = {}) => {
      if (options.method === "DELETE") return response({ syncing: false, worldKey: "world-a" });
      statusCalls += 1;
      return statusCalls === 1 ? response(synced) : delayed;
    },
  });
  sync.adoptTool({ id: "orogen", commit: COMMIT, syncSupported: true, syncEndpoint: "/sync" });
  await sync.selectWorld({ id: "world-a", name: "World A" });
  const selecting = sync.selectWorld({ id: "world-a", name: "World A" });
  const disabled = await sync.disable();
  assert.equal(disabled.syncing, false);
  resolveDelayed(response(synced));
  await selecting;
  assert.equal(sync.getState().syncing, false);
  assert.equal(sync.getFrameContext(), null);
});

test("sync refuses a persisted record after the live Orogen checkout changes", async () => {
  const changed = "a".repeat(40);
  const sync = createOuterToolSync({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        syncing: true, supported: true, worldKey: "world-a", revision: 9,
        syncToken: "sync-token-a", handoffId: "handoff-a", toolId: "orogen",
        sourceCommit: COMMIT, liveSourceCommit: changed,
        reason: "Pinned Orogen changed; reload World Portal before syncing.",
      }),
    }),
  });
  sync.adoptTool({ id: "orogen", commit: COMMIT, syncSupported: true, syncEndpoint: "/sync" });
  const state = await sync.selectWorld({ id: "world-a", name: "World A" });
  assert.equal(state.syncing, false);
  assert.equal(state.supported, false);
  assert.equal(state.liveSourceCommit, changed);
  assert.match(state.reason, /Orogen revision changed/);
});

test("a commit change reported during sync invalidates the previous frame context", async () => {
  const changed = "b".repeat(40);
  const response = (ok, status, payload) => ({ ok, status, json: async () => payload });
  const sync = createOuterToolSync({
    createToken: () => "operation-token-a",
    fetchImpl: async (_url, options = {}) => options.method === "POST"
      ? response(false, 409, {
        error: "Pinned Orogen changed; reload World Portal before syncing.",
        syncing: false, worldKey: "world-a", liveSourceCommit: changed,
      })
      : response(true, 200, {
        syncing: false, supported: true, worldKey: "world-a", liveSourceCommit: COMMIT,
      }),
  });
  sync.adoptTool({ id: "orogen", commit: COMMIT, syncSupported: true, syncEndpoint: "/sync" });
  await sync.selectWorld({ id: "world-a", name: "World A" });
  const state = await sync.enable(new Blob(["png"]), {
    worldKey: "world-a", worldName: "World A", handoffId: "handoff-a",
  });
  assert.equal(state.syncing, false);
  assert.equal(state.supported, false);
  assert.equal(sync.getFrameContext(), null);
});

test("port revalidation preserves an unchanged Orogen document and reloads changed ownership", async () => {
  let current = { ...CONTEXT };
  let next = current;
  let reloads = 0;
  const sync = {
    getFrameContext: () => current,
    selectWorld: async () => { current = next; },
    getState: () => ({ liveSourceCommit: COMMIT }),
  };
  const options = {
    portal: { activeWorldId: "world-a", getActiveWorld: () => ({ id: "world-a", name: "World A" }) },
    sync,
    frame: { getState: () => ({ attached: true }), reload: () => { reloads += 1; } },
    mirror: { getState: () => ({ requested: false }), invalidate() {} },
    bridge: { detach() {} },
    tool: { commit: COMMIT },
    worldGeneration: () => 0,
    baseUrl: "http://127.0.0.1:8770/",
  };
  await revalidateOuterToolContext(options);
  assert.equal(reloads, 0);
  next = null;
  await revalidateOuterToolContext(options);
  assert.equal(reloads, 1);
});

test("revalidation repairs an unbound import target but preserves a generator target", async () => {
  let sourceUrl = "http://127.0.0.1:8770/outer/orogen/import.html";
  let reloads = 0;
  const sync = {
    getFrameContext: () => CONTEXT,
    selectWorld: async () => {},
    getState: () => ({ liveSourceCommit: COMMIT }),
  };
  const options = {
    portal: { activeWorldId: "world-a", getActiveWorld: () => ({ id: "world-a", name: "World A" }) },
    sync,
    frame: {
      getState: () => ({ attached: true, loaded: true, sourceUrl }),
      reload: () => { reloads += 1; },
    },
    mirror: { getState: () => ({ requested: false }), invalidate() {} },
    bridge: { detach() {} },
    tool: { commit: COMMIT },
    worldGeneration: () => 0,
    baseUrl: "http://127.0.0.1:8770/",
  };
  const repaired = await revalidateOuterToolContext(options);
  assert.equal(repaired.importContextMismatch, true);
  assert.equal(reloads, 1);
  sourceUrl = buildOuterToolFrameUrl(
    "outer/orogen/import.html", "http://127.0.0.1:8770/", CONTEXT,
  );
  await revalidateOuterToolContext(options);
  assert.equal(reloads, 1);
  sourceUrl = buildOuterToolFrameUrl(
    "outer/orogen/index.html", "http://127.0.0.1:8770/", CONTEXT,
  );
  await revalidateOuterToolContext(options);
  assert.equal(reloads, 1);
});

test("revalidation rebinds a detached bridge after an exact import finishes loading", async () => {
  const sourceUrl = buildOuterToolFrameUrl(
    "outer/orogen/import.html", "http://127.0.0.1:8770/", CONTEXT,
  );
  let attachments = 0;
  const sync = {
    getFrameContext: () => CONTEXT,
    selectWorld: async () => {},
    getState: () => ({ liveSourceCommit: COMMIT }),
  };
  const bridge = {
    getState: () => ({ state: "detached" }),
    attach: ({ context }) => { assert.equal(context, CONTEXT); attachments += 1; },
    detach() {},
  };
  const result = await revalidateOuterToolContext({
    portal: { activeWorldId: "world-a", getActiveWorld: () => ({ id: "world-a", name: "World A" }) },
    sync,
    frame: {
      getState: () => ({ attached: true, loaded: true, sourceUrl }),
      get contentWindow() { return {}; },
      reload() { throw new Error("Exact context must not reload."); },
    },
    mirror: { getState: () => ({ requested: false }), invalidate() {} },
    bridge,
    tool: { commit: COMMIT },
    worldGeneration: () => 0,
    baseUrl: "http://127.0.0.1:8770/",
  });
  assert.equal(result.bridgeRebound, true);
  assert.equal(attachments, 1);
});

test("handoff and return provenance require exact world and pinned commit", () => {
  const tool = {
    id: "orogen", name: "World Orogen", commit: COMMIT,
    repository: "https://github.com/raguilar011095/planet_heightmap_generation",
    license: "GPL-3.0", entry: "outer/orogen/import.html",
  };
  const handoff = buildHandoffManifest({
    record: { id: "world-a", name: "World A" }, tool,
    pair: { mask: { id: "mask-a", name: "Mask" }, heightmap: { id: "height-a", name: "Height" } },
    finalization: { finalMaskLayerId: "final-mask", finalHeightmapLayerId: "final-height", width: 4, height: 2 },
    handoffId: "handoff-a", syncContext: CONTEXT,
  });
  const provenance = buildReturnProvenance({ handoff, worldId: "world-a", tool });
  assert.equal(provenance.sourceCommit, COMMIT);
  assert.deepEqual(provenance.inputLayerIds, ["final-mask", "final-height"]);
  assert.throws(() => buildReturnProvenance({ handoff, worldId: "world-b", tool }), /active world handoff/);
});

test("revision check validates a comparison-only fixed-ref response", () => {
  const payload = {
    format: "world-portal-orogen-update-check", version: 1,
    pinnedCommit: COMMIT, upstreamCommit: "a".repeat(40),
    ref: "refs/heads/main", updateAvailable: true, actionTaken: false,
  };
  assert.equal(validateOrogenRevisionCheck(payload, COMMIT), true);
  payload.actionTaken = true;
  assert.equal(validateOrogenRevisionCheck(payload, COMMIT), false);
});

test("mirror canvas selector chooses only the largest canvas render surface", () => {
  const preview = { width: 256, height: 128 };
  const render = { width: 1920, height: 1080 };
  const fakeDocument = { querySelectorAll: (selector) => selector === "canvas" ? [preview, render] : [] };
  assert.equal(selectOrogenRenderCanvas(fakeDocument), render);
});
